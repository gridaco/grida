<!-- https://github.com/rust-skia/rust-skia/tree/master/wasm-example -->

# WebAssembly Sample

## Build and Run the Example

To build this sample you will need to install Emscripten. By default the build script looks for the current installed [asdf](http://asdf-vm.com/) version of `emsdk`. If Emscripten is installed by other means on your system, you can customize its location by setting the `EMSDK` environment variable.

Then build the example:

```shell
make build
```

Start a web server (requires Python 3):

```shell
make serve
```

Then open http://localhost:8000/web/ in your browser.

## Notes

This sample uses the `wasm32-unknown-emscripten` target, because plain WASM [does not support linking to C/C++ libraries](https://github.com/rustwasm/team/issues/291#issuecomment-645482430) (yet).

For this reason there is a bit of ceremony involved both for building and for running the Rust code.

The build requires to set several environment variables:

- `EMSDK` -- required by the rust-skia build script to retrieve Emscripten's include files.

- `EMCC_CFLAGS` -- used to customize the Emscripten build, specifically:
- `-s ERROR_ON_UNDEFINED_SYMBOLS=0` -- required for Emscripten > 2.0.9, which stopped providing a stub for the `__gxx_personality_v0` C++ function.

  - `-s MAX_WEBGL_VERSION=2` -- enable Emscripten WebGL (1 & 2) support.

  - `-s MODULARIZE=1` -- make Emscripten output module-ish JS. This does not output proper ES6 modules, but without it the init relies on global variables and modules loading order.
  - `-s EXPORT_NAME=createRustSkiaModule` -- customize Emscripten's load function.

- `-s EXPORTED_RUNTIME_METHODS=GL` -- give access to Emscripten's GL group of functions, required to bind Emscripten to the WebGL context.
