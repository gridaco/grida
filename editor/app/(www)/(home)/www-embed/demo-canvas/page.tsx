import type { Metadata } from "next";
import PlaygroundCanvas from "@/grida-canvas-hosted/playground/playground-nossr";

export const metadata: Metadata = {
  title: "Canvas Playground",
  description: "Grida Canvas SDK Playground",
};

export default function CanvasPlaygroundPage() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <PlaygroundCanvas
        src="/examples/canvas/hero-main-demo.grida"
        backend="canvas"
      />
    </main>
  );
}
