"use client";

import type { Metadata } from "next";
import type { IDocumentEditorInit } from "@/grida-react-canvas";
import Editor from "../../../editor";
import React, { useEffect } from "react";
import queryattributes from "@/grida-react-canvas/nodes/utils/attributes";
import _002 from "@/theme/templates/formstart/002/page";

// export const metadata: Metadata = {
//   title: "User injected template example",
//   description: "Grida canvas example with user defined react component",
// };

function CustomComponent(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        width: 375,
        height: 812,
      }}
      {...queryattributes(props)}
    >
      <_002 />
    </div>
  );
}

export default function FileExamplePage() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor
        document={document}
        templates={{
          "002": CustomComponent,
        }}
      />
    </main>
  );
}

const document: IDocumentEditorInit = {
  debug: true,
  editable: true,
  document: {
    nodes: {
      page: {
        id: "page",
        name: "Page",
        type: "template_instance",
        template_id: "002",
        position: "relative",
        removable: false,
        active: true,
        locked: false,
        properties: {},
        props: {},
        overrides: {},
      },
    },
    scene: {
      type: "scene",
      children: ["page"],
      guides: [],
      constraints: {
        children: "single",
      },
    },
  },
  templates: {
    "002": _002.definition,
  },
};
