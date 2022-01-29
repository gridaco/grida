import React from "react";
import { Canvas } from "@code-editor/canvas";
import ClientOnly from "components/client-only";

export default function EditorCanvasDevPage() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
      }}
    >
      <ClientOnly>
        <Canvas
          filekey="unknown"
          pageid="1"
          viewbound={[
            0,
            0,
            window.innerWidth ||
              document.documentElement.clientWidth ||
              document.body.clientWidth,
            window.innerHeight ||
              document.documentElement.clientHeight ||
              document.body.clientHeight,
          ]}
          selectedNodes={[]}
          nodes={[]}
          renderItem={function (node): React.ReactNode {
            return <></>;
          }}
        />
      </ClientOnly>
    </div>
  );
}
