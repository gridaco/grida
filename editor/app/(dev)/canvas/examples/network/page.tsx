import Editor from "../../editor";
import grida from "@grida/schema";
import kolor from "@grida/color";
import { editor } from "@/grida-canvas";

const document: editor.state.IEditorStateInit = {
  editable: true,
  debug: false,
  document: {
    scenes_ref: ["main"],
    links: {
      main: ["a", "b"],
    },
    nodes: {
      main: {
        type: "scene",
        active: true,
        locked: false,
        background_color: kolor.colorformats.RGBA32F.TRANSPARENT,
        id: "main",
        name: "Main",
        constraints: { children: "multiple" },
        guides: [],
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
      a: grida.program.nodes.factory.createContainerNode("a", {
        name: "A",
        fill: {
          type: "solid",
          color: kolor.colorformats.RGBA32F.fromHEX("#00f"),
          active: true,
        },
        left: 0,
        top: 0,
      }),
      b: grida.program.nodes.factory.createContainerNode("b", {
        name: "B",
        fill: {
          type: "solid",
          color: kolor.colorformats.RGBA32F.fromHEX("#0f0"),
          active: true,
        },
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
