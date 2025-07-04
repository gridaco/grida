PRJ_ROOT_DIR := .
PRJ_CRATES_DIR := $(PRJ_ROOT_DIR)/crates

DOCKER_GRIDA_CANVAS_WASM_BUILD_FILE := $(PRJ_ROOT_DIR)/docker/grida-canvas-wasm.build.dockerfile
DOCKER_GRIDA_CANVAS_WASM_BUILD_IMAGE_NAME := grida-canvas-wasm-build-image
DOCKER_GRIDA_CANVAS_WASM_BUILD_CONTAINER_NAME := grida-canvas-wasm-build-container
DOCKER_WORKDIR := workspace

CRATES_GRIDA_CANVAS_WASM_SEG := grida-canvas-wasm
WASM_TARGET := target/wasm32-unknown-emscripten
OUT_DIR := $(PRJ_CRATES_DIR)/$(CRATES_GRIDA_CANVAS_WASM_SEG)/target
BIN_DIR := $(PRJ_CRATES_DIR)/$(CRATES_GRIDA_CANVAS_WASM_SEG)/lib/bin

.PHONY: grida-canvas-wasm grida-canvas-wasm-build grida-canvas-wasm-extract grida-canvas-wasm-bin grida-canvas-wasm-package

grida-canvas-wasm: grida-canvas-wasm-build grida-canvas-wasm-extract grida-canvas-wasm-bin grida-canvas-wasm-package

grida-canvas-wasm-build:
	docker build -f $(DOCKER_GRIDA_CANVAS_WASM_BUILD_FILE) -t $(DOCKER_GRIDA_CANVAS_WASM_BUILD_IMAGE_NAME) $(PRJ_CRATES_DIR)

grida-canvas-wasm-extract:
	-@docker rm -f $(DOCKER_GRIDA_CANVAS_WASM_BUILD_CONTAINER_NAME) 2>/dev/null || true
	mkdir -p $(OUT_DIR)
	docker create --name $(DOCKER_GRIDA_CANVAS_WASM_BUILD_CONTAINER_NAME) $(DOCKER_GRIDA_CANVAS_WASM_BUILD_IMAGE_NAME)
	docker cp $(DOCKER_GRIDA_CANVAS_WASM_BUILD_CONTAINER_NAME):/$(DOCKER_WORKDIR)/$(CRATES_GRIDA_CANVAS_WASM_SEG)/$(WASM_TARGET)/ $(OUT_DIR)/
	docker rm -f $(DOCKER_GRIDA_CANVAS_WASM_BUILD_CONTAINER_NAME)

grida-canvas-wasm-bin:
	cp $(OUT_DIR)/wasm32-unknown-emscripten/release/*.js $(BIN_DIR)/
	cp $(OUT_DIR)/wasm32-unknown-emscripten/release/*.wasm $(BIN_DIR)/

grida-canvas-wasm-package:
	pnpm --filter @grida/canvas-wasm build