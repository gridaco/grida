#!/usr/bin/env bash
set -euo pipefail

# Config
IMAGE_NAME="ghcr.io/pragmatrix/rust-skia-linux:latest"
CONTAINER_NAME="grida-build-server"
WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST_MOUNT="$WORKSPACE_ROOT"
RSYNC_EXCLUDES_FILE="$WORKSPACE_ROOT/docker/rsync-excludes.txt"

# Paths inside container
CONTAINER_WORKDIR="/workspace"
CONTAINER_HOST_MOUNT="/host"

# Crate-specific
WASM_CRATE_REL="crates/grida-canvas-wasm"
WASM_CRATE_PATH_HOST="$WORKSPACE_ROOT/$WASM_CRATE_REL"
WASM_TARGET_TRIPLE="wasm32-unknown-emscripten"
# Use workspace-level target directory (Cargo workspaces share /workspace/target)
WASM_TARGET_DIR_CONTAINER="$CONTAINER_WORKDIR/target/$WASM_TARGET_TRIPLE/release"
WASM_BIN_DIR_HOST="$WORKSPACE_ROOT/$WASM_CRATE_REL/lib/bin"

# Helpers
has_image() { docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; }
has_container() { docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; }
container_running() { docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; }

ensure_image() {
  if ! has_image; then
    echo "[wasm] Pulling image: $IMAGE_NAME"
    docker pull "$IMAGE_NAME"
  fi
}

create_container() {
  echo "[wasm] Creating persistent container: $CONTAINER_NAME"
  docker create \
    --name "$CONTAINER_NAME" \
    --workdir "$CONTAINER_WORKDIR" \
    -v grida-workspace:"$CONTAINER_WORKDIR" \
    -v grida-cargo-registry:/root/.cargo/registry \
    -v grida-cargo-git:/root/.cargo/git \
    -v grida-emsdk-cache:/emsdk/upstream/emscripten/cache \
    -v "$HOST_MOUNT":"$CONTAINER_HOST_MOUNT":ro \
    -e CARGO_HOME=/root/.cargo \
    -e RUSTUP_HOME=/root/.rustup \
    -e EMCC_CFLAGS="-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s ENVIRONMENT=web -s MAX_WEBGL_VERSION=2 -s MODULARIZE=1 -s EXPORT_NAME=createGridaCanvas -s EXPORTED_RUNTIME_METHODS=['GL','lengthBytesUTF8','stringToUTF8','UTF8ToString']" \
    --label grida.hostpath="$HOST_MOUNT" \
    "$IMAGE_NAME" bash -lc "sleep infinity"
}

ensure_running() {
  ensure_image
  has_container || create_container
  if ! container_running; then
    echo "[wasm] Starting container: $CONTAINER_NAME"
    docker start "$CONTAINER_NAME" >/dev/null
  fi
  bootstrap_toolchain
}

exec_in_container() { docker exec "$CONTAINER_NAME" bash -lc "$*"; }

ensure_rsync() {
  if exec_in_container 'command -v rsync >/dev/null 2>&1'; then
    return
  fi
  echo "[wasm] Installing rsync inside container (one-time)"
  # Try apt-get, apk, dnf, yum, zypper
  if exec_in_container 'command -v apt-get >/dev/null 2>&1'; then
    exec_in_container 'apt-get update && apt-get install -y rsync && rm -rf /var/lib/apt/lists/*'
  elif exec_in_container 'command -v apk >/dev/null 2>&1'; then
    exec_in_container 'apk add --no-cache rsync'
  elif exec_in_container 'command -v dnf >/dev/null 2>&1'; then
    exec_in_container 'dnf install -y rsync && dnf clean all'
  elif exec_in_container 'command -v yum >/dev/null 2>&1'; then
    exec_in_container 'yum install -y rsync && yum clean all'
  elif exec_in_container 'command -v zypper >/dev/null 2>&1'; then
    exec_in_container 'zypper --non-interactive install rsync'
  else
    echo "[wasm] ERROR: Could not install rsync inside container. Install it manually."
    exit 1
  fi
}

bootstrap_toolchain() {
  # Ensure emscripten env exists and target installed
  if ! exec_in_container '[ -f /emsdk/emsdk_env.sh ]'; then
    echo "[wasm] ERROR: /emsdk/emsdk_env.sh not found in base image."
    exit 1
  fi
  if ! exec_in_container 'rustup target list --installed | grep -q "wasm32-unknown-emscripten"'; then
    echo "[wasm] Adding wasm32-unknown-emscripten target"
    exec_in_container 'source /emsdk/emsdk_env.sh && rustup target add wasm32-unknown-emscripten'
  fi
}

sync_sources() {
  echo "[wasm] Syncing sources -> container volume"
  ensure_rsync
  exec_in_container "\
    mkdir -p '$CONTAINER_WORKDIR' && \
    rsync -a --delete \
      ${RSYNC_EXCLUDES_FILE:+--exclude-from='$CONTAINER_HOST_MOUNT/docker/rsync-excludes.txt'} \
      '$CONTAINER_HOST_MOUNT'/'./' \
      '$CONTAINER_WORKDIR'/'./' \
  "
}

build_wasm() {
  echo "[wasm] Building wasm crate"
  exec_in_container "\
    source /emsdk/emsdk_env.sh && \
    cd '$CONTAINER_WORKDIR/$WASM_CRATE_REL' && \
    cargo build --release --target $WASM_TARGET_TRIPLE \
  "
}

copy_artifacts_out() {
  echo "[wasm] Copying artifacts back to host (.js/.wasm)"
  mkdir -p "$WASM_BIN_DIR_HOST"
  local staging="/tmp/grida-wasm-artifacts"
  exec_in_container "\
    set -euo pipefail; \
    shopt -s nullglob; \
    src='$WASM_TARGET_DIR_CONTAINER'; \
    dst='$staging'; \
    rm -rf \"$dst\"; \
    mkdir -p \"$dst\"; \
    copied=0; \
    for f in \"$src\"/*.js \"$src\"/*.wasm; do \
      if [[ -e \"$f\" ]]; then cp -v \"$f\" \"$dst\"; copied=1; fi; \
    done; \
    if [[ \"$copied\" -eq 0 ]]; then echo 'No .js/.wasm artifacts found in' \"$src\"; fi \
  "
  docker cp "${CONTAINER_NAME}:${staging}/." "$WASM_BIN_DIR_HOST/" || true
  exec_in_container "rm -rf '$staging'" || true
}

clean_artifacts() {
  echo "[wasm] Cleaning artifacts inside container"
  exec_in_container "\
    cd '$CONTAINER_WORKDIR/$WASM_CRATE_REL' && \
    cargo clean \
  "
}

usage() {
  cat <<EOF
Usage: $0 <command>

Commands:
  up        Pull image, create and start persistent container
  build     Sync sources, build wasm, and copy artifacts back to host
  clean     Clean wasm artifacts inside container
  shell     Enter an interactive shell in the build server
  stop      Stop the persistent container
  down      Remove the persistent container (keeps volumes)
  nuke      Remove container and named volumes (DANGEROUS)
EOF
}

cmd_up() { ensure_running; echo "[wasm] Ready: $CONTAINER_NAME"; }
cmd_build() { ensure_running; sync_sources; build_wasm; copy_artifacts_out; }
cmd_clean() { ensure_running; clean_artifacts; }
cmd_shell() { ensure_running; docker exec -it "$CONTAINER_NAME" bash; }
cmd_stop() { container_running && docker stop "$CONTAINER_NAME" || true; }
cmd_down() { has_container && docker rm -f "$CONTAINER_NAME" || true; }
cmd_nuke() {
  cmd_down || true
  docker volume rm -f grida-workspace grida-cargo-registry grida-cargo-git grida-emsdk-cache || true
}

main() {
  local cmd="${1:-}"; shift || true
  case "$cmd" in
    up) cmd_up "$@" ;;
    build) cmd_build "$@" ;;
    clean) cmd_clean "$@" ;;
    shell) cmd_shell "$@" ;;
    stop) cmd_stop "$@" ;;
    down) cmd_down "$@" ;;
    nuke) cmd_nuke "$@" ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"