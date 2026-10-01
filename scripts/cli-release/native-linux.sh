#!/usr/bin/env bash
# The GNU binary must link against glibc 2.28, even on newer CI hosts.
set -euo pipefail
test "$(getconf GNU_LIBC_VERSION)" = "glibc 2.28"
export CARGO_HOME=/tmp/grida-cargo RUSTUP_HOME=/tmp/grida-rustup
curl --proto '=https' --tlsv1.2 -fsS https://sh.rustup.rs -o /tmp/grida-rustup.sh
sh /tmp/grida-rustup.sh -y --no-modify-path --profile minimal --default-toolchain "$GRIDA_RUST_TOOLCHAIN"
export PATH="$CARGO_HOME/bin:$PATH"
export CARGO_PROFILE_RELEASE_STRIP=symbols
export CARGO_PROFILE_RELEASE_LTO=thin
export CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
cargo build --locked --release -p grida-cli --bin grida --target "$GRIDA_RUST_TARGET" --target-dir /target
binary="/target/$GRIDA_RUST_TARGET/release/grida"
"$binary" --version
"$binary" --help >/dev/null
readelf --version-info "$binary" >"/target/$GRIDA_RUST_TARGET/glibc-versions.txt"
readelf --dynamic "$binary" >"/target/$GRIDA_RUST_TARGET/dynamic-libraries.txt"
