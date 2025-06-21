#!/bin/bash
set -e

# This setup script is based on rust-skia container setup
# https://github.com/pragmatrix/rust-skia-containers
# Adjusted for local Ubuntu (20.04 or later)

# Update and install essential packages
sudo apt-get update
sudo apt-get install -y software-properties-common wget curl git make unzip python pkg-config

# Add newer git and LLVM toolchain
sudo add-apt-repository ppa:git-core/ppa -y
wget -O - https://apt.llvm.org/llvm-snapshot.gpg.key | sudo apt-key add -
sudo add-apt-repository "deb http://apt.llvm.org/focal/ llvm-toolchain-focal-16 main"
sudo apt-get update

# Install development packages
sudo apt-get install -y \
  gcc \
  g++-16 \
  clang-16 \
  libgl1 \
  libgl1-mesa-dev \
  libgles2-mesa-dev \
  libssl-dev \
  libfontconfig1-dev \
  mesa-common-dev \
  libwayland-dev \
  g++-aarch64-linux-gnu

# Setup alternatives for clang
sudo update-alternatives \
  --install /usr/bin/clang clang /usr/bin/clang-16 90 \
  --slave /usr/bin/clang++ clang++ /usr/bin/clang++-16 \
  --slave /usr/bin/llvm-config llvm-config /usr/bin/llvm-config-16 \
  --slave /usr/bin/c++ c++ /usr/bin/clang++-16

# Install Rust
curl https://sh.rustup.rs -sSf | sh -s -- -y
source "$HOME/.cargo/env"

# Install Emscripten
export EMSCRIPTEN_VER=3.1.59
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install ${EMSCRIPTEN_VER}
./emsdk activate ${EMSCRIPTEN_VER}
source ./emsdk_env.sh
cd ..

echo "✅ Setup complete."