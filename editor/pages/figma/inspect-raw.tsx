import React from "react";
import styled from "@emotion/styled";
import { useReflectTargetNode } from "../../query/from-figma";
import { MonacoEditor } from "../../components/code-editor";

export default function InspectRaw() {
  //
  const targetNodeConfig = useReflectTargetNode();
  const figmaNode = targetNodeConfig?.figma;
  const reflect = targetNodeConfig?.reflect;
  //

  return (
    <>
      <MonacoEditor
        key={figmaNode?.id}
        height="100vh"
        defaultLanguage="json"
        defaultValue={JSON.stringify(figmaNode, null, 2)}
      />
    </>
  );
}
