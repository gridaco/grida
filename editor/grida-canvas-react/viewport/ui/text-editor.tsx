import React, { useEffect, useRef } from "react";
import {
  useNode,
  useTransformState,
  useCurrentEditor,
} from "@/grida-canvas-react";
import { useSingleSelection } from "../surface-hooks";
import { css } from "@/grida-canvas-utils/css";
import grida from "@grida/schema";
import cmath from "@grida/cmath";
import ContentEditable from "./contenteditable";

export function SurfaceTextEditor({ node_id }: { node_id: string }) {
  const editor = useCurrentEditor();
  const data = useSingleSelection(node_id);
  const node = useNode(node_id!);
  const { transform } = useTransformState();
  const ref = useRef<HTMLDivElement>(null);

  const stopPropagation = (e: React.BaseSyntheticEvent) => {
    e.stopPropagation();
  };

  // initially focus & select all text
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    requestAnimationFrame(() => {
      el.focus();
    });
  }, [ref]);

  return (
    <div
      id="richtext-editor-surface"
      className="fixed left-0 top-0 w-0 h-0 z-10"
    >
      <div
        style={
          data
            ? {
                position: "absolute",
                ...data.style,
                willChange: "transform",
                resize: "none",
                zIndex: 1,
              }
            : {
                display: "none",
              }
        }
      >
        <div
          style={{
            scale: cmath.transform.getScale(transform)[0],
            transformOrigin: "0 0",
          }}
        >
          <ContentEditable
            innerRef={ref}
            translate="no"
            contentEditable="plaintext-only"
            className="box-border outline-none"
            onPointerDown={stopPropagation}
            onDoubleClick={stopPropagation}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.currentTarget.blur();
              }
              stopPropagation(e);
            }}
            onBlur={() => editor.tryExitContentEditMode()}
            html={node.text as string}
            onChange={(e) => {
              const txt = e.currentTarget.textContent;
              editor.changeNodeText(node_id, txt);
            }}
            style={{
              opacity: node.opacity,
              ...css.toReactTextStyle(
                node as grida.program.nodes.TextNode as any as grida.program.nodes.ComputedTextNode
              ),
              whiteSpace: "pre",
            }}
          />
        </div>
      </div>
    </div>
  );
}
