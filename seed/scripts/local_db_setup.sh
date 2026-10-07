#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# Apply the Home Fixr schema to the LOCAL Supabase stack only.
#
#   npx supabase start            # once; config.toml disables auto-migrations
#   seed/scripts/local_db_setup.sh [--with-demo-seed] [--upto NNNN]
#
# Order: supabase/schema.sql, then supabase/migrations/*.sql sorted by name.
# --with-demo-seed also loads supabase/seed.sql (9 demo members standing in for
# "existing real users" so constraint/notification checks have something to hit).
# --upto 0008 stops after that migration (used to test the new migrations on a
# DB that already has data in it).
#
# Refuses to run against anything except the local docker container.
# ----------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/../.."

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_home-fixr}"
WITH_SEED=0
UPTO=""
ONLY_FROM=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-demo-seed) WITH_SEED=1 ;;
    --upto) UPTO="$2"; shift ;;
    --from) ONLY_FROM="$2"; shift ;;
    *) echo "unknown arg $1" >&2; exit 2 ;;
  esac
  shift
done

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Local Supabase DB container '$CONTAINER' is not running. Run: npx supabase start" >&2
  exit 1
fi

run_sql() {
  echo "==> $1"
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres < "$1"
}

if [[ -z "$ONLY_FROM" ]]; then
  run_sql supabase/schema.sql
fi
for f in $(ls supabase/migrations/*.sql | sort); do
  n="$(basename "$f" | cut -d_ -f1)"
  if [[ -n "$ONLY_FROM" && "$n" < "$ONLY_FROM" ]]; then continue; fi
  if [[ -n "$UPTO" && "$n" > "$UPTO" ]]; then break; fi
  run_sql "$f"
  if [[ "$WITH_SEED" == 1 && "$n" == "0008" ]]; then
    run_sql supabase/seed.sql
  fi
done
echo "done."
