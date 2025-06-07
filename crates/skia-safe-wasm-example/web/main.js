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
createRustSkiaModule().then((RustSkia) => {
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

  // Initialize Skia
  const state = RustSkia._init(canvas.width, canvas.height);

  // Draw a circle that follows the mouse pointer
  window.addEventListener("mousemove", (event) => {
    const canvasPos = canvas.getBoundingClientRect();
    RustSkia._draw_circle(
      state,
      event.clientX - canvasPos.x,
      event.clientY - canvasPos.y
    );
  });

  // Make canvas size stick to the window size
  window.addEventListener("resize", () => {
    if (resizeCanvasToDisplaySize(canvas)) {
      RustSkia._resize_surface(state, canvas.width, canvas.height);
    }
  });
});
