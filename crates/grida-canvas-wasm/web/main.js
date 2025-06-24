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
createGridaCanvas().then((GridaCanvas) => {
  console.log(GridaCanvas);
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
  handle = GridaCanvas.GL.registerContext(context, { majorVersion: 2 });
  GridaCanvas.GL.makeContextCurrent(handle);

  // Fit the canvas to the viewport
  resizeCanvasToDisplaySize(canvas);

  // Initialize the application
  const state = GridaCanvas._init(canvas.width, canvas.height);
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  // Configure optional overlays
  GridaCanvas._devtools_rendering_set_show_tiles(state, true);
  GridaCanvas._devtools_rendering_set_show_fps_meter(state, true);
  GridaCanvas._devtools_rendering_set_show_stats(state, false);
  GridaCanvas._devtools_rendering_set_show_hit_testing(state, true);
  GridaCanvas._set_show_ruler(state, true);

  const CMD = {
    Close: 0,
    ZoomIn: 1,
    ZoomOut: 2,
    ZoomDelta: 3,
    Pan: 4,
    Redraw: 5,
    Resize: 6,
  };

  // Load the demo scene from JSON
  fetch("http://grida.co/examples/canvas/hero-main-demo.grida")
    .then((r) => r.text())
    .then((txt) => {
      const len = GridaCanvas.lengthBytesUTF8(txt) + 1;
      const ptr = GridaCanvas._allocate(len);
      GridaCanvas.stringToUTF8(txt, ptr, len);
      GridaCanvas._load_scene_json(state, ptr, len - 1);
      GridaCanvas._deallocate(ptr, len);
      requestAnimationFrame(render);
    });

  // GridaCanvas._load_dummy_scene(state);
  // GridaCanvas._load_benchmark_scene(state, 50, 50);

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    GridaCanvas._pointer_move(state, x, y);
    if (isDragging) {
      GridaCanvas._command(state, CMD.Pan, -(x - lastX), -(y - lastY));
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
      GridaCanvas._command(state, CMD.ZoomDelta, event.deltaY * -0.01, 0);
    } else {
      GridaCanvas._command(state, CMD.Pan, event.deltaX, event.deltaY);
    }
  });

  function render() {
    GridaCanvas._redraw(state);
    requestAnimationFrame(render);
  }

  // Make canvas size stick to the window size
  window.addEventListener("resize", () => {
    if (resizeCanvasToDisplaySize(canvas)) {
      GridaCanvas._resize_surface(state, canvas.width, canvas.height);
    }
  });
});
