import type { Metadata } from "next";
import dynamic from "next/dynamic";

const PlaygroundCanvas = dynamic(
  () => import("@/scaffolds/playground-canvas/playground"),
  {
    ssr: false,
  }
);

export const metadata: Metadata = {
  title: "Canvas Playground",
  description: "Grida Canvas SDK Playground",
};

export default function CanvasPlaygroundPage() {
  return <PlaygroundCanvas />;
}
