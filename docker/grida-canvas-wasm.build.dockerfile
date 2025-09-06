FROM ghcr.io/pragmatrix/rust-skia-linux:latest

# Prepare Rust toolchain
RUN rustup update && \
    rustup default stable && \
    rustup target add wasm32-unknown-emscripten

WORKDIR /workspace
COPY . /workspace

RUN source /emsdk/emsdk_env.sh && \
    cd grida-canvas-wasm && \
    cargo clean && \
    cargo build --release --target wasm32-unknown-emscripten

CMD ["bash"]
