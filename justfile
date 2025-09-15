# Project root and crates directories
prj-root-dir := "."
prj-crates-dir := prj-root-dir + "/crates"

# Docker configuration
docker-grida-canvas-wasm-build-file := prj-root-dir + "/docker/grida-canvas-wasm.build.dockerfile"
docker-grida-canvas-wasm-build-image-name := "grida-canvas-wasm-build-image"
docker-grida-canvas-wasm-build-container-name := "grida-canvas-wasm-build-container"
docker-workdir := "workspace"

# Crates and paths
crates-grida-canvas-wasm-seg := "grida-canvas-wasm"
wasm-target := "target/wasm32-unknown-emscripten"
bin-dir := prj-crates-dir + "/" + crates-grida-canvas-wasm-seg + "/lib/bin"

default:
    just --list

# Main recipe that runs all steps
build canvas wasm: grida-canvas-wasm-build grida-canvas-wasm-extract grida-canvas-wasm-package

serve canvas wasm: grida-canvas-wasm-serve

package canvas wasm: grida-canvas-wasm-package

# Build Docker image
grida-canvas-wasm-build:
    docker build -f {{docker-grida-canvas-wasm-build-file}} -t {{docker-grida-canvas-wasm-build-image-name}} {{prj-crates-dir}}

# Extract files directly from Docker container to lib/bin
grida-canvas-wasm-extract:
    #!/usr/bin/env bash
    docker rm -f {{docker-grida-canvas-wasm-build-container-name}} 2>/dev/null || true
    mkdir -p {{bin-dir}}
    docker create --name {{docker-grida-canvas-wasm-build-container-name}} {{docker-grida-canvas-wasm-build-image-name}}
    # Copy specific files from exact locations
    docker cp {{docker-grida-canvas-wasm-build-container-name}}:/{{docker-workdir}}/{{crates-grida-canvas-wasm-seg}}/{{wasm-target}}/release/grida-canvas-wasm.js {{bin-dir}}/
    docker cp {{docker-grida-canvas-wasm-build-container-name}}:/{{docker-workdir}}/{{crates-grida-canvas-wasm-seg}}/{{wasm-target}}/release/grida_canvas_wasm.wasm {{bin-dir}}/
    docker rm -f {{docker-grida-canvas-wasm-build-container-name}}

# Build package with pnpm
grida-canvas-wasm-package:
    pnpm --filter @grida/canvas-wasm build 

grida-canvas-wasm-serve:
    pnpm --filter @grida/canvas-wasm serve