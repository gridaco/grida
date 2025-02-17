import type { Metadata } from "next";
import Editor from "../../editor";
import { canvas_examples } from "@/scaffolds/playground/k";
import { notFound } from "next/navigation";

type Params = {
  example: string;
};

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata | null> {
  const { example: example_id } = params;

  const example = canvas_examples.find((e) => e.id === example_id);

  if (!example) return null;

  return {
    title: example?.name,
    description: example?.name,
  };
}

export default function FileExamplePage({ params }: { params: Params }) {
  const { example: example_id } = params;
  const example = canvas_examples.find((e) => e.id === example_id);

  if (!example) return notFound();

  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor src={example?.url} />
    </main>
  );
}
