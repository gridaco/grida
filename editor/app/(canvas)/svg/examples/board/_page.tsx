"use client";

import * as React from "react";
import { dotcanvas } from "dotcanvas";
import { createFixtureFs } from "./_fixture";
import { SvgCanvas, type FrameInput } from "./_core/svg-canvas";
import {
  SvgCanvasProvider,
  SvgCanvasView,
} from "./_components/svg-canvas-view";

export default function SvgCanvasPlayground() {
  const [store, setStore] = React.useState<SvgCanvas | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const fs = createFixtureFs();
      // The REAL dotcanvas read path (in-memory ReadableFs — no Node fs).
      const canvas = await dotcanvas.read(fs);

      // Observation: `board` + `files: ["*.svg"]` are now first-class in
      // dotcanvas, so this resolves to `editor: "board"` with no warnings. The
      // canvas-view reads `layout` to place each frame.
      // eslint-disable-next-line no-console
      console.info(
        "[svg-canvas spike] dotcanvas.read →",
        {
          editor: canvas.editor,
          files: canvas.files,
          mode: canvas.mode,
          docs: canvas.documents.length,
        },
        canvas.warnings
      );

      const frames: FrameInput[] = [];
      for (const doc of canvas.documents) {
        if (!doc.layout) continue; // canvas-view requires placement
        const svg = await fs.read(doc.src);
        if (!svg) continue;
        const { x = 0, y = 0, w = 320, h = 200, z = 0 } = doc.layout;
        frames.push({
          id: doc.id,
          src: doc.src,
          svg,
          rect: { x, y, width: w, height: h },
          z,
        });
      }

      if (alive) {
        const s = new SvgCanvas({ frames });
        // spike dev aid: expose the store for console/automation poking
        (window as unknown as { __svgCanvas?: SvgCanvas }).__svgCanvas = s;
        setStore(s);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!store) {
    // Same checkerboard as the canvas viewport, so the async `.canvas` read
    // resolves into the populated canvas without a color/layout blink.
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background:
            "repeating-conic-gradient(#f3f4f6 0% 25%, #ffffff 0% 50%) 50% / 24px 24px",
        }}
      />
    );
  }

  return (
    <SvgCanvasProvider store={store}>
      <div style={{ width: "100vw", height: "100vh" }}>
        <SvgCanvasView />
      </div>
    </SvgCanvasProvider>
  );
}
