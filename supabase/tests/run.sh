#!/usr/bin/env bash
# Runs the schema + sync tests against a throwaway local Postgres database.
set -e
cd "$(dirname "$0")"
DB=kod_test
pg_isready -q || { echo "Postgres is not running"; exit 1; }
dropdb --if-exists $DB 2>/dev/null || true; createdb $DB
psql -q -d $DB -f stub_auth.sql -f ../migrations/0001_kingdom.sql -f ../migrations/0002_war.sql -f ../migrations/0003_town.sql -f ../migrations/0004_focus.sql -f ../migrations/0005_version.sql -f ../migrations/0006_tavern.sql -f sync_test.sql 2>&1 | grep -v NOTICE
