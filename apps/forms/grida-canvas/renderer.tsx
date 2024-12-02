"use client";

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { __useInternal, useDocument } from "./provider";
import { NodeElement } from "./nodes/node";
import { domapi } from "./domapi";
import { cmath } from "./math";

/**
 * A hook that calculates and notifies the editor content offset relative to the editor viewport.
 *
 * @param contentRef - A ref to the content element within the editor.
 */
function __useEditorContentOffsetNotifyEffect(
  contentRef: React.RefObject<HTMLElement>,
  deps: any[] = []
) {
  const [_, dispatch] = __useInternal();

  const syncoffset = useCallback(
    (offset: cmath.Vector2) => {
      dispatch({
        type: "__internal/sync-artboard-offset",
        offset: offset,
      });
    },
    [dispatch]
  );

  useLayoutEffect(() => {
    const viewportElement = domapi.get_viewport_element(); // Assume this gets the editor viewport element
    const contentElement = contentRef.current;

    if (!viewportElement || !contentElement) {
      console.warn("Editor or content element is not available");
      return;
    }

    function updateOffset() {
      const calculatedOffset = domapi.get_displacement_between(
        viewportElement,
        contentElement
      );

      // Notify the editor engine (placeholder logic)
      if (calculatedOffset) {
        syncoffset(calculatedOffset);
      }
    }

    // Initial offset update
    updateOffset();

    // Observe size or position changes
    const observer = new ResizeObserver(() => {
      updateOffset();
    });

    observer.observe(viewportElement);
    observer.observe(contentElement);

    return () => {
      observer.disconnect();
    };
  }, [contentRef, syncoffset, ...deps]);
}

export function StandaloneDocumentEditorContent() {
  const ref = useRef<HTMLDivElement>(null);
  const {
    state: { document, document_key },
  } = useDocument();
  const { root_id } = document;

  __useEditorContentOffsetNotifyEffect(ref, [document_key]);

  return (
    <div id={domapi.k.EDITOR_CONTENT_ELEMENT_ID} ref={ref}>
      <NodeElement node_id={root_id}></NodeElement>
    </div>
  );
}
