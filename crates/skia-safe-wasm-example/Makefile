EMSDK ?= ~/.asdf/installs/emsdk/$(shell asdf current emsdk | tr -s ' ' | cut -d ' ' -f 2)
BUILD = EMCC_CFLAGS="-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s MAX_WEBGL_VERSION=2 -s MODULARIZE=1 -s EXPORT_NAME=createRustSkiaModule -s EXPORTED_RUNTIME_METHODS=GL" EMSDK=$(EMSDK) cargo build --target wasm32-unknown-emscripten

.PHONY: build
build:
	$(BUILD)

.PHONY: build_release
build_release:
	$(BUILD) --release

.PHONY: serve
serve:
	python3 -m http.server