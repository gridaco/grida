#!/usr/bin/env bash
set -euo pipefail

# Config
IMAGE_NAME="grida-build-server:latest"
CONTAINER_NAME="grida-build-server"
DOCKERFILE_PATH="$(cd "$(dirname "$0")/.." && pwd)/docker/build-server.dockerfile"
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

build_image() {
  echo "[wasm] Building image: $IMAGE_NAME"
  docker build -f "$DOCKERFILE_PATH" -t "$IMAGE_NAME" "$WORKSPACE_ROOT"
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
    --label grida.hostpath="$HOST_MOUNT" \
    "$IMAGE_NAME"
}

ensure_running() {
  has_image || build_image
  has_container || create_container
  if ! container_running; then
    echo "[wasm] Starting container: $CONTAINER_NAME"
    docker start "$CONTAINER_NAME" >/dev/null
  fi
}

sync_sources() {
  echo "[wasm] Syncing sources -> container volume"
  if [[ ! -f "$RSYNC_EXCLUDES_FILE" ]]; then
    echo "[wasm] WARN: rsync excludes file missing at $RSYNC_EXCLUDES_FILE"
  fi
  docker exec "$CONTAINER_NAME" bash -lc "\
    mkdir -p '$CONTAINER_WORKDIR' && \
    rsync -a --delete \
      ${RSYNC_EXCLUDES_FILE:+--exclude-from='$CONTAINER_HOST_MOUNT/docker/rsync-excludes.txt'} \
      '$CONTAINER_HOST_MOUNT'/'./' \
      '$CONTAINER_WORKDIR'/'./' \
  "
}

build_wasm() {
  echo "[wasm] Building wasm crate"
  docker exec "$CONTAINER_NAME" bash -lc "\
    source /emsdk/emsdk_env.sh && \
    cd '$CONTAINER_WORKDIR/$WASM_CRATE_REL' && \
    cargo build --release --target $WASM_TARGET_TRIPLE \
  "
}

copy_artifacts_out() {
  echo "[wasm] Copying artifacts back to host (.js/.wasm)"
  mkdir -p "$WASM_BIN_DIR_HOST"
  local staging="/tmp/grida-wasm-artifacts"
  docker exec "$CONTAINER_NAME" bash -lc "\
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
  # cleanup staging (optional)
  docker exec "$CONTAINER_NAME" bash -lc "rm -rf '$staging'" || true
}

clean_artifacts() {
  echo "[wasm] Cleaning artifacts inside container"
  docker exec "$CONTAINER_NAME" bash -lc "\
    cd '$CONTAINER_WORKDIR/$WASM_CRATE_REL' && \
    cargo clean \
  "
}

usage() {
  cat <<EOF
Usage: $0 <command>

Commands:
  up        Build image and ensure persistent container is running
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