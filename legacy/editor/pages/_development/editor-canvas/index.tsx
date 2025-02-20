import React from "react";
import { Canvas } from "@code-editor/canvas";
import ClientOnly from "components/client-only";
import useMeasure from "react-use-measure";

export default function EditorCanvasDevPage() {
  const [canvasSizingRef, canvasBounds] = useMeasure();

  return (
    <div
      ref={canvasSizingRef}
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
            canvasBounds.left,
            canvasBounds.top,
            canvasBounds.bottom,
            canvasBounds.right,
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
