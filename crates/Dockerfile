FROM ghcr.io/pragmatrix/rust-skia-linux:latest

# Prepare Rust toolchain
RUN rustup update && \
    rustup default stable && \
    rustup target add wasm32-unknown-emscripten

ENV EMCC_CFLAGS="-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s MAX_WEBGL_VERSION=2 -s MODULARIZE=1 -s EXPORT_NAME=createGridaCanvas -s EXPORTED_RUNTIME_METHODS=['GL','lengthBytesUTF8','stringToUTF8','UTF8ToString']"

WORKDIR /workspace
COPY . /workspace

RUN source /emsdk/emsdk_env.sh && \
    cd grida-canvas-wasm && \
    cargo build --release --target wasm32-unknown-emscripten

CMD ["bash"]
