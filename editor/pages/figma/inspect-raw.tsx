import React from "react";
import { MonacoEditor } from "../../components/code-editor";
import { useDesign } from "../../query-hooks";
import LoadingLayout from "../../layout/loading-overlay";

/**
 * shows full node data as json in a monaco editor
 * @returns
 */
export default function InspectRaw() {
  //
  const design = useDesign();
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
        defaultLanguage="json"
        defaultValue={JSON.stringify(figma, null, 2)}
      />
    </>
  );
}
