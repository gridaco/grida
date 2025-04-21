import { cn } from "@/utils";
import React from "react";

export function Canvas({
  node,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { node: any }) {
  return (
    <div className={cn("w-full h-full", className)} {...props}>
      <iframe
        srcDoc={renderHTMLWithTailwind(renderJSONToHTML(node || ""))}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
      />
    </div>
  );
}

function renderHTMLWithTailwind(bodyHTML: string): string {
  return `
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="p-4">${bodyHTML}</body>
    </html>
  `;
}

function renderJSONToHTML(node: any): string {
  if (typeof node === "string") {
    return node;
  }

  const { tag, class: className, attributes = {}, children = [] } = node;

  const classAttr = className ? `class="${className}"` : "";
  const attrPairs = Object.entries(attributes).map(([k, v]) => `${k}="${v}"`);
  if (classAttr) attrPairs.unshift(classAttr);
  const attrString = attrPairs.join(" ");

  const childrenHTML = children.map(renderJSONToHTML).join("");

  return `<${tag}${attrString ? " " + attrString : ""}>${childrenHTML}</${tag}>`;
}
