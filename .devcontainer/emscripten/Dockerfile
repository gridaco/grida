# MIT - https://github.com/pragmatrix/rust-skia-containers
# This container is based on ubuntu 18 because we need to link with libstdc++ 6.0.25 because of ABI incompatibilities.
# <https://github.com/rust-skia/rust-skia/issues/393>
FROM ubuntu:20.04

# For github actions we need a newer git version
RUN apt-get update \
 && apt-get install -y software-properties-common \
 && add-apt-repository ppa:git-core/ppa -y

RUN apt-get install -y wget

## Add llvm package repository for ubuntu 20 (focal))
RUN wget -O - https://apt.llvm.org/llvm-snapshot.gpg.key | apt-key add -
RUN add-apt-repository "deb http://apt.llvm.org/focal/ llvm-toolchain-focal-16 main"

# unzip: for installing the Android NDK
# libgl1 libgl1-mesa-dev mesa-common-dev: for builds that need OpenGL
# libgles2-mesa-dev for egl support.
# clang-16 / g++-16 is needed for more recent emscripten builds.
# make is needed for supplemental builds.
RUN apt-get update && apt-get install -y \
	curl \
	gcc \
	g++-16 \
	git \
	libgl1 \
	libgl1-mesa-dev \
	libgles2-mesa-dev \
	libssl-dev \
	libfontconfig1-dev \
	mesa-common-dev \
	pkg-config \
	python \
	unzip \
	make \
	libwayland-dev

RUN update-alternatives \
	--install /usr/bin/clang clang /usr/bin/clang-16 90 \
	--slave /usr/bin/clang++ clang++ /usr/bin/clang++-16 \
	--slave /usr/bin/llvm-config llvm-config /usr/bin/llvm-config-16 \
	--slave /usr/bin/c++ c++ /usr/bin/clang++-16

RUN curl https://sh.rustup.rs -sSf | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# wasm32-unknown-emscripten

SHELL ["/bin/bash", "-c"]

ENV EMSCRIPTEN_VER=3.1.59

RUN git clone https://github.com/emscripten-core/emsdk.git \
	&& (cd emsdk && ./emsdk install ${EMSCRIPTEN_VER}) \
	&& (cd emsdk && ./emsdk activate ${EMSCRIPTEN_VER})

# Needed for cross compilation to aarch64-unknown-linux-gnu
RUN apt-get install -y g++-aarch64-linux-gnu