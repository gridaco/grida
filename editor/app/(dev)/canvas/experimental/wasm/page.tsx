import type { Metadata } from "next";
import Editor from "../../editor";

export const metadata: Metadata = {
  title: "Grida Canvas (WASM)",
  description: "Grida Canvas Playground (WASM)",
};

export default function CanvasPlaygroundPage() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor backend="canvas" />
    </main>
  );
}
