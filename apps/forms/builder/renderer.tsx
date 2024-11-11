"use client";
import React from "react";
import { useDocument } from "./provider";
import { NodeElement } from "./template-builder/node";

// function useHTML5Backend() {}

export function StandaloneDocumentEditorContent() {
  const {
    state: {
      document: { nodes, root_id },
    },
  } = useDocument();

  const rootnode = nodes[root_id];

  return <NodeElement node_id={root_id} component={undefined}></NodeElement>;
}
