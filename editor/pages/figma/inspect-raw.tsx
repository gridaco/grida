import React from "react";
import { MonacoEditor } from "components/code-editor";
import { useFigmaNode } from "hooks";
import LoadingLayout from "layouts/loading-overlay";

/**
 * shows full node data as json in a monaco editor
 * @returns
 */
export default function InspectRaw() {
  //
  const design = useFigmaNode({ type: "use-router" });
  if (!design) {
    return <LoadingLayout />;
  }
  const { node, reflect, raw, remote, figma } = design;
  //
  return (
    <>
      <MonacoEditor
        key={figma.id}
        height="100vh"
        language="json"
        value={JSON.stringify(figma, null, 2)}
      />
    </>
  );
}
