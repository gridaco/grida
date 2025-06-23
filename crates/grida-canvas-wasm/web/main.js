/**
 * Make a canvas element fit to the display window.
 */
function resizeCanvasToDisplaySize(canvas) {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
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
  const canvas = document.querySelector("#canvas");
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
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  const CMD = {
    Close: 0,
    ZoomIn: 1,
    ZoomOut: 2,
    ZoomDelta: 3,
    Pan: 4,
    Redraw: 5,
    Resize: 6,
  };

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

  // RustSkia._load_dummy_scene(state);
  RustSkia._load_benchmark_scene(state, 50, 50);
  requestAnimationFrame(render);

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    RustSkia._pointer_move(state, x, y);
    if (isDragging) {
      RustSkia._command(state, CMD.Pan, -(x - lastX), -(y - lastY));
    }
    lastX = x;
    lastY = y;
  });

  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    lastX = event.clientX - rect.left;
    lastY = event.clientY - rect.top;
    isDragging = true;
  });

  const endDrag = () => {
    isDragging = false;
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("pointerleave", endDrag);

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.ctrlKey) {
      RustSkia._command(state, CMD.ZoomDelta, event.deltaY * -0.01, 0);
    } else {
      RustSkia._command(state, CMD.Pan, event.deltaX, event.deltaY);
    }
  });

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
