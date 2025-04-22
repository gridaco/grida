import React, { useEffect, useRef } from "react";
import { cn } from "@/utils";
import { type PortableNode } from "../schema";

const DEFAULT_IFRAME_HTML = `
  <html>
    <head>
      <script src="https://cdn.tailwindcss.com"></script>
      <script>
        window.addEventListener("message", (event) => {
          if (event.data?.type === "render") {
            document.body.innerHTML = event.data.html;
          }
        });
      </script>
    </head>
    <body class="w-screen h-screen"></body>
  </html>
`;

export function Canvas({
  node,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { node: any }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      const html = renderJSONToHTML(node || "");
      iframe.contentWindow?.postMessage({ type: "render", html }, "*");
    };

    iframe.addEventListener("load", handleLoad);

    // Already loaded, just send the new content
    const html = renderJSONToHTML(node || "");
    iframe.contentWindow?.postMessage({ type: "render", html }, "*");

    return () => {
      iframe.removeEventListener("load", handleLoad);
    };
  }, [node]);

  return (
    <div className={cn("w-full h-full", className)} {...props}>
      <iframe
        ref={iframeRef}
        srcDoc={DEFAULT_IFRAME_HTML}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
      />
    </div>
  );
}

function renderJSONToHTML(node: PortableNode | string): string {
  if (typeof node === "string") {
    return node;
  }

  const {
    tag,
    class: _class,
    style,
    d,
    text,
    src,
    attributes = {},
    children = [],
    ...otherAttributes
  } = node;

  const __attributes_map = {
    src,
    class: _class,
    style,
    d,
    ...(attributes ?? {}),
    ...(otherAttributes ?? {}),
  };

  const attributes_str = Object.entries(__attributes_map)
    .map(([key, value]) => {
      if (value === undefined || value === null) return "";
      return `${key}="${value}"`;
    })
    .filter(Boolean)
    .join(" ");

  const childrenHTML = text
    ? text
    : typeof children === "string"
      ? children
      : children.map(renderJSONToHTML).join("");

  return `<${tag} ${attributes_str}>${childrenHTML}</${tag}>`;
}
