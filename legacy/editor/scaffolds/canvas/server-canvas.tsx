import React, { useEffect } from "react";
import { useEditorState, useWorkspace } from "core/states";
import { useDispatch } from "core/dispatch";

export function ServerCanvas() {
  const [state] = useEditorState();

  const { highlightedLayer, highlightLayer } = useWorkspace();
  const dispatch = useDispatch();

  const { selectedPage, design, selectedNodes, canvasMode } = state;

  useEffect(() => {
    //
  }, []);

  return (
    <iframe
      src="http://localhost:6626/canvas-server"
      width={"100%"}
      height={"100%"}
    />
  );
}
