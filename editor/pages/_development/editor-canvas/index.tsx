import React from "react";
import { Canvas } from "@code-editor/canvas";

export default function EditorCanvasDevPage() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
      }}
    >
      <Canvas>
        <div
          style={{
            background: "white",
            width: "100px",
            height: "100px",
            pointerEvents: "none",
          }}
        />
      </Canvas>
      ;
    </div>
  );
}
