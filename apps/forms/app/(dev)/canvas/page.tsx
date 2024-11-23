import CanvasPlayground from "@/scaffolds/playground-canvas/playground";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Canvas Playground",
  description: "Grida Canvas SDK Playground",
};

export default function CanvasPlaygroundPage() {
  return <CanvasPlayground />;
}
