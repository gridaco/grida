import init from "../dist/index.mjs";

/**
 * Make a canvas element fit to the display window.
 */
function resizeCanvasToDisplaySize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

// This loads and initialize our WASM module
init({
  locateFile: (path) => {
    return `../lib/bin/${path}`;
  },
}).then((Factory) => {
  console.log(Factory);

  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  const canvasel = document.getElementById("canvas");
  const grida = Factory.createCanvasSurface("canvas");
  console.log(grida);

  // Fit the canvas to the viewport
  resizeCanvasToDisplaySize(canvasel);

  grida.devtools_rendering_set_show_tiles(true);
  grida.devtools_rendering_set_show_fps_meter(true);
  grida.devtools_rendering_set_show_stats(false);
  grida.devtools_rendering_set_show_hit_testing(true);
  grida.devtools_rendering_set_show_ruler(true);

  // Load the demo scene from JSON
  fetch("./demo.grida")
    .then((r) => r.text())
    .then((txt) => {
      grida.loadScene(txt);
      requestAnimationFrame(render);
    });

  // grida.loadDummyScene();
  // grida.loadBenchmarkScene(50, 50);

  canvasel.addEventListener("pointermove", (event) => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvasel.getBoundingClientRect();
    const x = (event.clientX - rect.left) * dpr;
    const y = (event.clientY - rect.top) * dpr;

    grida.pointermove(x, y);
    if (isDragging) {
      grida.execCommandPan(-(x - lastX), -(y - lastY));
    }
    lastX = x;
    lastY = y;
  });

  canvasel.addEventListener("pointerdown", (event) => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvasel.getBoundingClientRect();
    lastX = (event.clientX - rect.left) * dpr;
    lastY = (event.clientY - rect.top) * dpr;
    isDragging = true;
  });

  const endDrag = () => {
    isDragging = false;
  };
  canvasel.addEventListener("pointerup", endDrag);
  canvasel.addEventListener("pointercancel", endDrag);
  canvasel.addEventListener("pointerleave", endDrag);

  canvasel.addEventListener("wheel", (event) => {
    event.preventDefault();
    const dpr = window.devicePixelRatio || 1;
    if (event.ctrlKey) {
      grida.execCommandZoomDelta(event.deltaY * -0.01);
    } else {
      grida.execCommandPan(event.deltaX * dpr, event.deltaY * dpr);
    }
  });

  function render() {
    grida.redraw();
    requestAnimationFrame(render);
  }

  // Make canvas size stick to the window size
  window.addEventListener("resize", () => {
    if (resizeCanvasToDisplaySize(canvasel)) {
      grida.resize(canvasel.width, canvasel.height);
    }
  });
});
