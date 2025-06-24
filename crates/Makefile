IMAGE_NAME=grida-wasm-builder
CONTAINER_NAME=grida-build-container
WASM_TARGET=target/wasm32-unknown-emscripten
WASM_CRATE=grida-canvas-wasm
WORKDIR=workspace
OUT_DIR=$(WASM_CRATE)/target

.PHONY: all build extract clean

all: build extract

build:
	docker build -f Dockerfile -t $(IMAGE_NAME) .

extract:
	docker build -f Dockerfile -t $(IMAGE_NAME) .
	-@docker rm -f $(CONTAINER_NAME) 2>/dev/null || true
	mkdir -p $(OUT_DIR)
	docker create --name $(CONTAINER_NAME) $(IMAGE_NAME)
	docker cp $(CONTAINER_NAME):/$(WORKDIR)/$(WASM_CRATE)/$(WASM_TARGET)/ $(OUT_DIR)/
	docker rm -f $(CONTAINER_NAME)

clean:
	rm -rf $(OUT_DIR)/*
