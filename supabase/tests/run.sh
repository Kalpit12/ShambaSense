#!/usr/bin/env bash
# Usage: tests/run.sh <psql connection args...>
# Recreates a scratch database, loads the stub, applies migrations in order and runs the tests.
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
psql "$@" -q -d postgres -c 'drop database if exists shambasense_test' -c 'create database shambasense_test'
for role in anon authenticated service_role; do psql "$@" -q -d postgres -c "drop role if exists $role" 2>/dev/null || true; done
psql "$@" -q -v ON_ERROR_STOP=1 -d shambasense_test -f "$here/tests/supabase-stub.sql"
for f in "$here"/migrations/*.sql; do psql "$@" -q -v ON_ERROR_STOP=1 -d shambasense_test -f "$f"; done
psql "$@" -q -t -v ON_ERROR_STOP=1 -d shambasense_test -f "$here/tests/access_rules_test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
