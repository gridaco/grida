import React from "react";
import grida from "@grida/schema";
import queryattributes from "./utils/attributes";

/**
 * DOM fallback renderer for MarkdownEmbedNode.
 *
 * The canonical rendering path for MarkdownEmbedNode is the Rust/Skia canvas
 * backend (via MarkdownPainter). This component exists so the DOM renderer
 * doesn't throw "Unknown node type" when a markdown embed ends up in a
 * DOM-rendered subtree (e.g. previews, tests). It renders the raw markdown
 * source in a monospaced block without GFM parsing.
 */
export const MarkdownEmbedWidget = ({
  markdown,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.MarkdownEmbedNode>) => {
  const text = typeof markdown === "string" ? markdown : "";

  return (
    <div
      {...queryattributes(props)}
      style={{
        ...style,
        whiteSpace: "pre-wrap",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        padding: 12,
        overflow: "hidden",
      }}
    >
      {text}
    </div>
  );
};

MarkdownEmbedWidget.type = "markdown_embed";
