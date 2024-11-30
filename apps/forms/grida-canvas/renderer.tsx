"use client";

import React, { useLayoutEffect } from "react";
import { useDocument } from "./provider";
import { NodeElement } from "./nodes/node";
import { domapi } from "./domapi";

/**
 * A hook that calculates and notifies the editor content offset relative to the editor viewport
 */
function useEditorContentOffset() {
  useLayoutEffect(() => {
    //
    domapi.get_viewport_element();
    //
  }, []);
  //
}

export function StandaloneDocumentEditorContent() {
  const {
    state: {
      document: { root_id },
    },
  } = useDocument();

  return <NodeElement node_id={root_id}></NodeElement>;
}
