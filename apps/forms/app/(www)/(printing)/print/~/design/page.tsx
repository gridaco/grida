"use client";
import dynamic from "next/dynamic";

const PlaygroundCanvas = dynamic(
  () => import("@/scaffolds/playground-canvas/playground"),
  {
    ssr: false,
  }
);

export default function DesignPage() {
  return (
    <main className="w-full min-h-screen p-10">
      <div className="w-full h-full overflow-hidden rounded-md shadow-lg border">
        <PlaygroundCanvas />
      </div>
    </main>
  );
}
