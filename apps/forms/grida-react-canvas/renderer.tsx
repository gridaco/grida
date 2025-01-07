"use client";

import React, { useCallback, useContext, useLayoutEffect, useRef } from "react";
import { useDocument, useResizeNotifier, useTransform } from "./provider";
import { NodeElement } from "./nodes/node";
import { domapi } from "./domapi";
import { cmath } from "@grida/cmath";

/**
 * A hook that calculates and notifies the editor content offset relative to the editor viewport.
 *
 * @param contentRef - A ref to the content element within the editor.
 */
function __useEditorContentOffsetNotifyEffect(
  contentRef: React.RefObject<HTMLElement>,
  deps: any[] = []
) {
  const notify = useResizeNotifier();

  const syncoffset = useCallback(
    ({
      content_offset,
      viewport_offset,
    }: {
      content_offset: cmath.Vector2;
      viewport_offset: cmath.Vector2;
    }) => {
      notify({
        content_offset: content_offset,
        viewport_offset: viewport_offset,
      });
    },
    [notify]
  );

  useLayoutEffect(() => {
    const viewportElement = domapi.get_viewport_element(); // Assume this gets the editor viewport element
    const contentElement = contentRef.current;

    if (!viewportElement || !contentElement) {
      console.warn("Editor or content element is not available");
      return;
    }

    function updateOffset() {
      if (!viewportElement || !contentElement) return;
      const viewport_rect = viewportElement.getBoundingClientRect();
      const content_rect = contentElement.getBoundingClientRect();
      const viewport_position: cmath.Vector2 = [
        viewport_rect.x,
        viewport_rect.y,
      ];
      const content_position: cmath.Vector2 = [content_rect.x, content_rect.y];

      const content_offset = cmath.vector2.sub(
        content_position,
        viewport_position
      );

      // Notify the editor engine (placeholder logic)
      if (content_offset) {
        syncoffset({ content_offset, viewport_offset: viewport_position });
      }
    }

    // Initial offset update (once and after 50ms)
    updateOffset();
    setTimeout(() => {
      updateOffset();
    }, 50);

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

const UserDocumentCustomRendererContext = React.createContext<
  Record<string, CustomReactRenderer>
>({});

export function useUserDocumentCustomRenderer() {
  return useContext(UserDocumentCustomRendererContext);
}

type CustomReactRenderer = React.ComponentType<any>;

interface DocumentContentViewProps {
  /**
   * custom templates to render
   */
  templates?: Record<string, CustomReactRenderer>;
}

export function StandaloneDocumentContent({
  templates,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & DocumentContentViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const {
    state: { document, document_key, transform },
  } = useDocument();
  const { root_id } = document;

  __useEditorContentOffsetNotifyEffect(ref, [document_key]);

  return (
    <div id={domapi.k.EDITOR_CONTENT_ELEMENT_ID} ref={ref} {...props}>
      <UserDocumentCustomRendererContext.Provider value={templates ?? {}}>
        <NodeElement node_id={root_id} />
      </UserDocumentCustomRendererContext.Provider>
    </div>
  );
}

export function ContentTransform({ children }: React.PropsWithChildren<{}>) {
  const transform = useTransform();

  return (
    <div
      className="w-full h-full"
      style={{
        transform: `translate3d(${transform.translate[0]}px, ${transform.translate[1]}px, 0) scale3d(${transform.scale}, ${transform.scale}, 1)`,
      }}
    >
      {children}
    </div>
  );
}
