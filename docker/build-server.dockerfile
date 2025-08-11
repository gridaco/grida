FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

# Install prerequisites and build tools
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    software-properties-common \
    curl \
    wget \
    git \
    pkg-config \
    make \
    unzip \
    rsync \
    python3 \
    python3-pip \
    libssl-dev \
    libfontconfig1-dev \
    libgl1 \
    libgl1-mesa-dev \
    libgles2-mesa-dev \
    mesa-common-dev \
    libwayland-dev \
    gcc \
    g++ \
  && rm -rf /var/lib/apt/lists/*

# Add LLVM/Clang 16 (required by recent emscripten)
RUN apt-get update \
  && apt-get install -y --no-install-recommends gnupg \
  && wget -O - https://apt.llvm.org/llvm-snapshot.gpg.key | apt-key add - \
  && add-apt-repository "deb http://apt.llvm.org/focal/ llvm-toolchain-focal-16 main" \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    clang-16 \
    g++-16 \
    llvm-16 \
  && update-alternatives \
    --install /usr/bin/clang clang /usr/bin/clang-16 90 \
    --slave /usr/bin/clang++ clang++ /usr/bin/clang++-16 \
    --slave /usr/bin/llvm-config llvm-config /usr/bin/llvm-config-16 \
    --slave /usr/bin/c++ c++ /usr/bin/clang++-16 \
  && rm -rf /var/lib/apt/lists/*

# Install Rust toolchain
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustup update && rustup default stable

# Emscripten SDK
SHELL ["/bin/bash", "-lc"]
ENV EMSCRIPTEN_VER=3.1.59
RUN git clone https://github.com/emscripten-core/emsdk.git /emsdk \
  && cd /emsdk \
  && ./emsdk install ${EMSCRIPTEN_VER} \
  && ./emsdk activate ${EMSCRIPTEN_VER} \
  && echo 'source /emsdk/emsdk_env.sh' >> /etc/bash.bashrc

# Add Rust target for Emscripten
RUN source /emsdk/emsdk_env.sh && rustup target add wasm32-unknown-emscripten

# Configure default emcc flags commonly used by this repo
ENV EMCC_CFLAGS="-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s ENVIRONMENT=web -s MAX_WEBGL_VERSION=2 -s MODULARIZE=1 -s EXPORT_NAME=createGridaCanvas -s EXPORTED_RUNTIME_METHODS=['GL','lengthBytesUTF8','stringToUTF8','UTF8ToString']"

# Working directory for synced sources and persistent target cache
WORKDIR /workspace

# Keep container running as a long-lived build server
CMD ["bash", "-lc", "sleep infinity"]