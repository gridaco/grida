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
      <Canvas
        nodes={[]}
        renderItem={function (node): React.ReactNode {
          return <></>;
        }}
      />
    </div>
  );
}
