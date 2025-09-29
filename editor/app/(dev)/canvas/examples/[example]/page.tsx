import type { Metadata } from "next";
import { canvas_examples } from "@/grida-canvas-hosted/playground/examples";
import { notFound } from "next/navigation";
import Editor from "../../editor";

type Params = {
  example: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata | null> {
  const { example: example_id } = await params;

  const example = canvas_examples.find((e) => e.id === example_id);

  if (!example) return null;

  return {
    title: example?.name,
    description: example?.name,
  };
}

export default async function FileExamplePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { example: example_id } = await params;
  const example = canvas_examples.find((e) => e.id === example_id);

  if (!example) return notFound();

  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor src={example?.url} />
    </main>
  );
}
