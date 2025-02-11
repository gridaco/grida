"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";

const PlaygroundCanvas = dynamic(
  () => import("@/scaffolds/playground-canvas/playground"),
  {
    ssr: false,
  }
);

export default function Editor() {
  useEffect(() => {
    addEventListener("beforeunload", (event) => {
      event.preventDefault();
      return "";
    });
  }, []);

  return <PlaygroundCanvas />;
}
