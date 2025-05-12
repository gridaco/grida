import { IDocumentEditorInit } from "@/grida-react-canvas";
import Editor from "../../editor";
import grida from "@grida/schema";
import { cmath } from "@grida/cmath";

const document: IDocumentEditorInit = {
  editable: true,
  debug: false,
  document: {
    scenes: {
      main: {
        backgroundColor: cmath.color.hex_to_rgba8888("#00000000"),
        type: "scene",
        id: "main",
        name: "Main",
        constraints: { children: "multiple" },
        guides: [],
        children: ["a", "b"],
        edges: [
          {
            id: "a-b",
            type: "edge",
            a: { type: "anchor", target: "a" },
            b: { type: "anchor", target: "b" },
            // a: { type: "position", x: 50, y: 50 },
            // b: { type: "position", x: 250, y: 150 },
          },
        ],
      },
    },
    nodes: {
      a: grida.program.nodes.factory.createContainerNode("a", {
        name: "A",
        fill: { type: "solid", color: cmath.color.hex_to_rgba8888("#00f") },
        left: 0,
        top: 0,
      }),
      b: grida.program.nodes.factory.createContainerNode("b", {
        name: "B",
        fill: { type: "solid", color: cmath.color.hex_to_rgba8888("#0f0") },
        left: 200,
        top: 100,
      }),
    },
  },
};

export default async function NetworkExamplePage() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor document={document} />
    </main>
  );
}
