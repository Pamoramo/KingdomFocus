#!/usr/bin/env bash
# Runs the schema + sync tests against a throwaway local Postgres database.
set -e
cd "$(dirname "$0")"
DB=kod_test
dropdb --if-exists $DB 2>/dev/null; createdb $DB
psql -q -d $DB -f stub_auth.sql -f ../migrations/0001_kingdom.sql -f sync_test.sql 2>&1 | grep -v NOTICE
