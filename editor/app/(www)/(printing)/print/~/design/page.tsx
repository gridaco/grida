"use client";
import dynamic from "next/dynamic";

const PlaygroundCanvas = dynamic(
  () => import("@/grida-canvas-hosted/playground/playground"),
  {
    ssr: false,
  }
);

export default function DesignPage() {
  return (
    <main className="w-full min-h-screen p-6 flex flex-col gap-4">
      <div className="w-full h-full overflow-hidden rounded-md shadow-lg border">
        <PlaygroundCanvas />
      </div>
    </main>
  );
}
