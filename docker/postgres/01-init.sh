#!/bin/sh
# Runs once, on an empty data volume.
#
# Creates the two roles the security model depends on (PROJECT_PLAN section 8):
#   school_owner — owns the schema, runs migrations and seeds.
#   school_app   — used by the running app. NOBYPASSRLS, so RLS policies always apply.
#
# It also creates the separate test database the integration suite truncates freely.
set -eu

create_db_with_roles() {
  db_name="$1"

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-SQL
	SELECT 'CREATE DATABASE ${db_name}'
	 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db_name}')\gexec
SQL

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db_name" <<-SQL
	CREATE EXTENSION IF NOT EXISTS pgcrypto;
	CREATE EXTENSION IF NOT EXISTS btree_gist;
	CREATE EXTENSION IF NOT EXISTS pg_trgm;

	-- The owner may create objects; it is never used by the running app.
	GRANT ALL ON DATABASE ${db_name} TO ${OWNER_ROLE};
	ALTER SCHEMA public OWNER TO ${OWNER_ROLE};

	-- The app role gets connect + usage only. Table grants are issued by the
	-- RLS migration in Phase 1, table by table, so nothing is granted by accident.
	GRANT CONNECT ON DATABASE ${db_name} TO ${APP_ROLE};
	GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
SQL
}

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-SQL
	DO \$\$
	BEGIN
	  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${OWNER_ROLE}') THEN
	    CREATE ROLE ${OWNER_ROLE} LOGIN PASSWORD '${OWNER_PASSWORD}' NOBYPASSRLS;
	  END IF;

	  -- NOBYPASSRLS is the single most important line in this file: without it a
	  -- forgotten branch_id filter would silently return another branch's rows.
	  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
	    CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOBYPASSRLS NOCREATEDB NOCREATEROLE NOSUPERUSER;
	  END IF;
	END
	\$\$;
SQL

create_db_with_roles "$APP_DB"
create_db_with_roles "$TEST_DB"

echo "Roles ${OWNER_ROLE} / ${APP_ROLE} and databases ${APP_DB} / ${TEST_DB} are ready."
