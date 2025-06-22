FROM ghcr.io/pragmatrix/rust-skia-linux:latest

# Prepare Rust toolchain
RUN rustup update && \
    rustup default stable && \
    rustup target add wasm32-unknown-emscripten

# ENV EMCC_CFLAGS="-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s MAX_WEBGL_VERSION=2"
# ENV EMCC_CFLAGS="-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s MAX_WEBGL_VERSION=2 -s MODULARIZE=1 -s EXPORT_NAME=createGridaCanvas -s EXPORTED_RUNTIME_METHODS=['GL','lengthBytesUTF8','stringToUTF8'] -s EXPORTED_FUNCTIONS=['_init','_resize_surface','_redraw','_load_scene_json','_malloc','_free']"
ENV EMCC_CFLAGS="-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s MAX_WEBGL_VERSION=2 -s MODULARIZE=1 -s EXPORT_ALL=1 -s EXPORT_NAME=createGridaCanvas -s EXPORTED_RUNTIME_METHODS=['GL','lengthBytesUTF8','stringToUTF8','malloc','free']"


WORKDIR /work
COPY . /work

RUN source /emsdk/emsdk_env.sh && \
    cd grida && \
    cargo build --release --target wasm32-unknown-emscripten

CMD ["bash"]
