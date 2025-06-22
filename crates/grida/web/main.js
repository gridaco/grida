/**
 * Make a canvas element fit to the display window.
 */
function resizeCanvasToDisplaySize(canvas) {
  const width = canvas.clientWidth | 1;
  const height = canvas.clientHeight | 1;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

// This loads and initialize our WASM module
createGridaCanvas().then((RustSkia) => {
  console.log(RustSkia);
  // Create the WebGL context
  let context;
  const canvas = document.querySelector("#glcanvas");
  context = canvas.getContext("webgl2", {
    antialias: true,
    depth: true,
    stencil: true,
    alpha: true,
  });

  // Register the context with emscripten
  handle = RustSkia.GL.registerContext(context, { majorVersion: 2 });
  RustSkia.GL.makeContextCurrent(handle);

  // Fit the canvas to the viewport
  resizeCanvasToDisplaySize(canvas);

  // Initialize the application
  const state = RustSkia._init(canvas.width, canvas.height);

  // Load the demo scene
  // fetch("scene.json")
  //   .then((r) => r.text())
  //   .then((txt) => {
  //     const len = RustSkia.lengthBytesUTF8(txt) + 1;
  //     const ptr = RustSkia._malloc(len);
  //     RustSkia.stringToUTF8(txt, ptr, len);
  //     RustSkia._load_scene_json(state, ptr, len - 1);
  //     RustSkia._free(ptr);
  //     requestAnimationFrame(render);
  //   });

  RustSkia._load_dummy_scene(state);
  requestAnimationFrame(render);

  function render() {
    RustSkia._redraw(state);
    requestAnimationFrame(render);
  }

  // Make canvas size stick to the window size
  window.addEventListener("resize", () => {
    if (resizeCanvasToDisplaySize(canvas)) {
      RustSkia._resize_surface(state, canvas.width, canvas.height);
    }
  });
});
