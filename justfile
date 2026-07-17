default:
    just --list

# Format the entire repo (JS/TS via oxfmt; Rust left with the engine repo)
fmt:
    pnpm fmt

# Run type checking
check:
    pnpm turbo typecheck
    pnpm fmt:check

# Run tests
test:
    pnpm turbo test

# Run Supabase Splinter advisors against the local database — same set
# of security + performance lints the Dashboard's "Database Advisors"
# page shows. CLI doesn't ship a native command for this yet; we curl
# the upstream `splinter.sql` and pipe through psql, then awk to filter
# the wide row format down to `[level] name: detail`.
# Requires `supabase start`. Pass `levels=WARN,ERROR,INFO` for strict.
#
# Tracking upstream:
#   https://github.com/supabase/cli/issues/3839
#   https://github.com/supabase/cli/issues/3839#issuecomment-4397668907  (our comment)
# Drop this recipe when the CLI ships `supabase db check` or equivalent.
lint-supabase-db url="postgresql://postgres:postgres@127.0.0.1:54322/postgres" levels="WARN,ERROR":
    #!/usr/bin/env bash
    # `set -euo pipefail` upgrades from the default sh-without-pipefail —
    # otherwise a psql failure (connection refused, schema drift) gets
    # swallowed by the awk/sort downstream and the recipe exits 0 silently.
    set -euo pipefail
    splinter=$(mktemp -t splinter.XXXXXX.sql)
    trap 'rm -f "$splinter"' EXIT
    curl -sSfL https://raw.githubusercontent.com/supabase/splinter/main/splinter.sql -o "$splinter"
    # Capture before filtering so any psql error propagates instead of being
    # masked by an empty result set.
    output=$(psql {{url}} -X -qtA -F$'\t' --pset=pager=off \
        -c "BEGIN READ ONLY;" -f "$splinter" -c "COMMIT;")
    printf '%s\n' "$output" \
      | awk -F'\t' -v lvls="^({{replace(levels, ",", "|")}})$" \
          'NF >= 7 && $3 ~ lvls { print "  [" $3 "] " $1 ": " $7 }' \
      | sort -u

# Dev setup
dev packages:
    pnpm dev:packages

# The Rust engine (canvas wasm, wpt) moved to the engine repo — build it there.