# Runbook — backup, restore, and the things that go wrong at 3am

Written for whoever is on the other end of the phone call, not for whoever wrote the
code. Every command here is meant to be copied verbatim.

## Backups

A `backup` container takes a `pg_dump --format=custom` every 24 hours into a named
volume, encrypts it with AES-256 when `BACKUP_PASSPHRASE` is set, and keeps 14 days.

Two details worth knowing:

- **Every dump is verified before the old ones are pruned.** `pg_restore --list` has to
  read it back; a file that cannot be listed is deleted and the old backups survive.
  A run of failures therefore never eats the last good copy.
- **Without `BACKUP_PASSPHRASE` the dumps are plaintext** on the volume, and the log
  says so on every run. Set it.

### Where they are

```bash
docker compose -f docker-compose.prod.yml exec backup ls -lh /backups
docker compose -f docker-compose.prod.yml logs --tail=50 backup
```

### Copy them off the box

A backup on the same disk as the database is not a backup. Whatever the hosting
decision turns out to be (§16 question 10 is still open), this is the shape:

```bash
docker run --rm -v education-center_backups:/backups -v "$PWD:/out" alpine \
  sh -c 'cp /backups/$(ls -t /backups | head -1) /out/'
# …then ship that file to object storage / another machine, however you do that.
```

### Take one right now

```bash
docker compose -f docker-compose.prod.yml exec backup \
  sh -c 'INTERVAL_SECONDS=1 timeout 120 sh /usr/local/bin/backup.sh'
```

## Restore — the drill

**Do this before go-live, on a throwaway database.** A restore nobody has rehearsed is
a restore that gets rehearsed during the incident.

### 1. Decrypt, if it is encrypted

```bash
openssl enc -d -aes-256-cbc -pbkdf2 \
  -pass "pass:$BACKUP_PASSPHRASE" \
  -in school-20260916-030000.dump.enc \
  -out school.dump
```

### 2. Restore into a scratch database first

Never straight over the live one. Restore beside it, look at it, then swap.

```bash
docker compose -f docker-compose.prod.yml exec db \
  createdb -U postgres school_restore_check

docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U postgres -d school_restore_check --no-owner < school.dump
```

### 3. Check it is actually the data you wanted

```bash
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d school_restore_check -c "
  select
    (select count(*) from students)          as students,
    (select count(*) from class_sessions)    as sessions,
    (select count(*) from attendance_records) as attendance,
    (select max(session_date) from class_sessions) as last_session;"
```

`last_session` tells you how much you are about to lose: everything after that date is
gone. Decide _before_ the swap, not after.

### 4. Swap

```bash
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml exec db psql -U postgres -c \
  "alter database school rename to school_broken_$(date +%Y%m%d);"
docker compose -f docker-compose.prod.yml exec db psql -U postgres -c \
  "alter database school_restore_check rename to school;"
docker compose -f docker-compose.prod.yml start app
```

Keep `school_broken_*` until you are certain. Disk is cheaper than the alternative.

### 5. Re-check the roles

A restore with `--no-owner` does not recreate the roles or their grants. The app
connects as `school_app`, which **must not** be able to bypass RLS — if that is wrong
after a restore, every branch can read every other branch:

```bash
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d school -c "
  select rolname, rolbypassrls from pg_roles where rolname in ('school_app','school_owner');"
```

`school_app` must show `f`. If it shows `t`, stop and fix it before letting anyone in.

## Common incidents

### The app answers 503 on `/api/health`

The database is unreachable. The route pings it, which is the point — a container
whose database has gone away is not healthy.

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 db
```

### Somebody is locked out

Ten failed sign-ins against one username within 15 minutes locks that username for 15
minutes. It expires on its own; to clear it now:

```bash
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d school -c \
  "delete from login_attempts where username = 'admin_nsr';"
```

### The public lookup is refusing a parent who has the right details

Either the centre has switched it off, or the rate limiter has them. Check both:

```bash
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d school -c \
  "select lookup_enabled from center_settings;"

docker compose -f docker-compose.prod.yml exec db psql -U postgres -d school -c \
  "select student_code, count(*) from lookup_attempts
   where not success and created_at > now() - interval '1 hour'
   group by student_code order by 2 desc limit 5;"
```

The per-code limit is 5 failures an hour. If a real parent is stuck behind somebody
else's guessing, that is the limit doing its job — and it is worth knowing about.

### A parent says somebody else can see their child's record

The portal's identity is the parent's **phone**, not an account, so revocation is a data
change rather than a button. Two levers, smallest first:

**One family.** Change the parent's phone on the student (الطلاب → تعديل). The phone is
the identity, so every portal session behind the old number stops working immediately —
including the one on the handset that was lost. Siblings follow the same number, so this
covers the whole family at once.

**The whole centre.** Switch `lookup_enabled` off in settings. It closes the lookup and
the portal together, at the data layer, with no deploy:

```bash
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d school -c   "update center_settings set lookup_enabled = false;"
```

To see how many sessions are live at all (the rows name nobody — both columns are salted
hashes):

```bash
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d school -c   "select count(*) from portal_sessions where expires_at > now();"
```

Sessions last thirty days and are capped at five per phone, so a code typed on a sixth
device evicts the oldest by itself.

### Never set `log_statement = 'all'` on the production database

The portal passes `PORTAL_PHONE_SALT` to Postgres as a bind parameter. Bind parameters
stay out of `pg_stat_statements`, but `log_statement = 'all'` writes them to the log —
and that salt is the only thing stopping `portal_sessions.parent_phone_hash` being
reversed back into a phone number, because Egyptian mobiles are a small enough space to
exhaust in seconds.

The default is `none`. Leave it there. If a query has to be traced, trace it with
`auto_explain` or for a single session, never database-wide.

### A migration failed on deploy

The `migrate` container exits non-zero and the app never starts, which is deliberate:
an app that does not recognise its schema should not take traffic.

```bash
docker compose -f docker-compose.prod.yml logs migrate
```

Fix forward. Do not edit an applied migration — drizzle tracks them by hash, and a
changed file makes every later deploy fail in a much more confusing way.

## What is NOT automated

- **Off-site copies.** The backup container writes to a local volume only.
- **Restore drills.** Nothing reminds you. Put it in a calendar.
- **Certificate renewal** is Caddy's, and it does it silently — which means nobody
  notices if the domain stops pointing here. Check `docker compose logs caddy` if
  HTTPS starts failing.
