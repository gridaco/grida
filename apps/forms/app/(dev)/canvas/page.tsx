// import CanvasPlayground from "@/scaffolds/playground-canvas/playground";
import dynamic from "next/dynamic";
import { Metadata } from "next";

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
