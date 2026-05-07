default:
    just --list

# Format the entire repo (JS/TS via oxfmt + Rust via cargo fmt)
fmt:
    pnpm fmt
    cargo fmt --all

# Run type checking and cargo check
check:
    pnpm turbo typecheck
    pnpm fmt:check
    cargo check --all-targets --all-features
    cargo fmt --all -- --check
    cargo clippy --no-deps -- -D warnings

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
    @curl -sSfL https://raw.githubusercontent.com/supabase/splinter/main/splinter.sql -o /tmp/splinter.sql
    @psql {{url}} -X -qtA -F$'\t' --pset=pager=off \
        -c "BEGIN READ ONLY;" -f /tmp/splinter.sql -c "COMMIT;" \
      | awk -F'\t' -v lvls="^({{replace(levels, ",", "|")}})$" \
          'NF >= 7 && $3 ~ lvls { print "  [" $3 "] " $1 ": " $7 }' \
      | sort -u

# Dev setup
dev packages:
    pnpm dev:packages

# Build canvas WASM using the dedicated justfile in crates/grida-canvas-wasm
build canvas wasm:
    just --justfile crates/grida-canvas-wasm/justfile build

# Serve canvas WASM
serve canvas wasm:
    pnpm --filter @grida/canvas-wasm serve

# Package canvas WASM
package canvas wasm:
    just --justfile crates/grida-canvas-wasm/justfile package

# Run web-platform-tests against the grida_wpt binary. Requires the
# `gridaco/wpt` fork cloned as a sibling (../wpt). Default target is
# the whole css/ suite; pass a narrower path for pilot runs.
# See docs/contributing/wpt.md for details.
#
#   just wpt                                       # css/ (the default)
#   just wpt css/css-transforms/                   # one subsuite
#   just wpt css/css-transforms/2d-rotate-001.html # one file
wpt target="css/":
    cargo build -p grida_wpt --release
    cd ../wpt && ./wpt run \
        --binary="{{justfile_directory()}}/target/release/grida_wpt" \
        --log-wptreport="{{justfile_directory()}}/target/wpt-report.json" \
        --log-mach=- \
        --log-mach-level=info \
        grida \
        {{target}}