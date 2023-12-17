import React, { useState, useEffect } from "react";
import {
  D2CVanillaPreview,
  WebWorkerD2CVanillaPreview,
} from "scaffolds/preview-canvas";
import { Canvas } from "@code-editor/canvas";
import useMeasure from "react-use-measure";
import { FrameTitleRenderer } from "scaffolds/canvas/render/frame-title";
import { useRouter } from "next/router";

export default function CanvasServerPage() {
  const router = useRouter();

  const { key: __fk } = router.query;
  const filkey = __fk as string;

  const [canvasSizingRef, canvasBounds] = useMeasure();
  const [selectedPage, setSelectedPage] = useState<string | null>(null);

  // const thisPageNodes = selectedPage
  //   ? design.pages.find((p) => p.id == selectedPage).children.filter(Boolean)
  //   : [];

  const thisPageNodes = [];

  return (
    <div ref={canvasSizingRef}>
      <Canvas
        key={selectedPage}
        viewbound={[
          canvasBounds.left,
          canvasBounds.top,
          canvasBounds.bottom,
          canvasBounds.right,
        ]}
        filekey={filkey}
        pageid={selectedPage}
        selectedNodes={[] /*selectedNodes.filter(Boolean)*/}
        // highlightedLayer={highlightedLayer}
        onSelectNode={(node) => {
          // dispatch({ type: "select-node", node: node?.id });
        }}
        onClearSelection={() => {
          // dispatch({ type: "select-node", node: null });
        }}
        nodes={thisPageNodes}
        // initialTransform={ } // TODO: if the initial selection is provided from first load, from the query param, we have to focus to fit that node.
        renderItem={(p) => {
          return (
            // <WebWorkerD2CVanillaPreview
            //   key={p.node.id}
            //   target={p.node}
            //   {...p}
            // />
            <D2CVanillaPreview key={p.node.id} target={p.node} {...p} />
          );
        }}
        config={{
          can_highlight_selected_layer: true,
          marquee: {
            disabled: false,
          },
          grouping: {
            disabled: false,
          },
        }}
        renderFrameTitle={(p) => (
          <FrameTitleRenderer
            key={p.id}
            {...p}
            onRunClick={() => {
              // startIsolatedViewMode();
            }}
          />
        )}
      />
    </div>
  );
}
