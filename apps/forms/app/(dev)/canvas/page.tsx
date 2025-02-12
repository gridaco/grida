import type { Metadata } from "next";
import Editor from "./editor";

export const metadata: Metadata = {
  title: "Canvas Playground",
  description: "Grida Canvas SDK Playground",
};

export default function CanvasPlaygroundPage() {
  return <Editor />;
}
