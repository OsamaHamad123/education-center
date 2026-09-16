#!/bin/sh
# Daily encrypted backups with 14-day retention (PROJECT_PLAN 13.1).
#
# A loop rather than cron: the container has one job, and a sleeping shell is easier
# to reason about — and to see failing in `docker compose logs` — than a cron daemon
# whose output goes nowhere.
#
# Every dump is verified by listing its contents before the old ones are pruned. A
# backup nobody has read is not a backup; see `docs/RUNBOOK.md` for the restore drill,
# which is the half that actually matters.
set -eu

BACKUP_DIR=${BACKUP_DIR:-/backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}
INTERVAL_SECONDS=${INTERVAL_SECONDS:-86400}
DB_HOST=${DB_HOST:-db}
DB_NAME=${DB_NAME:-school}
DB_USER=${DB_USER:-school_owner}

mkdir -p "$BACKUP_DIR"

log() { echo "[backup] $(date -Iseconds) $*"; }

# `postgres:16-alpine` ships without openssl, so encryption would have silently
# fallen back to plaintext on every run — the script says so in its log, but nobody
# reads a log that has been saying the same thing for a year. Installed once at
# startup; apk is a no-op when it is already there.
if [ -n "${BACKUP_PASSPHRASE:-}" ] && ! command -v openssl >/dev/null 2>&1; then
  log "installing openssl"
  apk add --no-cache openssl >/dev/null 2>&1 || log "WARNING: could not install openssl"
fi

take_backup() {
  stamp=$(date +%Y%m%d-%H%M%S)
  file="$BACKUP_DIR/school-$stamp.dump"

  # Custom format: compressed, and restorable table-by-table with pg_restore, which
  # matters when what you actually need back is one branch's students.
  if ! pg_dump --host="$DB_HOST" --username="$DB_USER" --dbname="$DB_NAME" \
       --format=custom --compress=9 --file="$file"; then
    log "FAILED to dump"
    return 1
  fi

  # Read it back. A dump that pg_restore cannot list is a file, not a backup.
  if ! pg_restore --list "$file" >/dev/null 2>&1; then
    log "FAILED verification, removing $file"
    rm -f "$file"
    return 1
  fi

  if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    # Symmetric AES-256. Without a passphrase the dump is plaintext on the volume,
    # which is why the README tells you to set one before going live.
    if openssl enc -aes-256-cbc -pbkdf2 -salt \
         -pass "pass:$BACKUP_PASSPHRASE" -in "$file" -out "$file.enc"; then
      rm -f "$file"
      file="$file.enc"
    else
      # Deleted, not kept: a plaintext dump sitting where an encrypted one was
      # expected is worse than no dump, because nobody would notice.
      log "FAILED to encrypt — removing the plaintext dump; backups are NOT running"
      rm -f "$file" "$file.enc"
      return 1
    fi
  else
    log "WARNING: BACKUP_PASSPHRASE is not set — this dump is NOT encrypted"
  fi

  log "wrote $file ($(du -h "$file" | cut -f1))"
}

prune() {
  # Only after a successful dump, so a run of failures never deletes the last good one.
  find "$BACKUP_DIR" -name 'school-*.dump*' -mtime "+$RETENTION_DAYS" -print -delete |
    while read -r old; do log "pruned $old"; done
}

log "starting; every ${INTERVAL_SECONDS}s into $BACKUP_DIR, keeping ${RETENTION_DAYS} days"
while true; do
  if take_backup; then
    prune
  fi
  sleep "$INTERVAL_SECONDS"
done
