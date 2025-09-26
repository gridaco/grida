import type { Metadata } from "next";
import Editor from "./editor";

export const metadata: Metadata = {
  title: "Grida Canvas",
  description: "Grida Canvas Playground",
};

export default async function CanvasPlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ room: string }>;
}) {
  const { room } = await searchParams;
  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor backend="canvas" room_id={room} />
    </main>
  );
}
