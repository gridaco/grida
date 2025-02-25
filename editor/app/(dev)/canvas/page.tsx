import type { Metadata } from "next";
import Editor from "./editor";

export const metadata: Metadata = {
  title: "Grida Canvas",
  description: "Grida Canvas Playground",
};

export default function CanvasPlaygroundPage() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor />
    </main>
  );
}
