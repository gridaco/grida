"use server";

import { streamObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { createStreamableValue } from "ai/rsc";
import { z } from "zod";

const MODEL = process.env.NEXT_PUBLIC_OPENAI_BEST_MODEL_ID || "gpt-4o-mini";

const schema = z.object({
  html: z.object({
    tag: z.string(),
    class: z.string().optional(),
    src: z.string().optional(),
    attributes: z.record(z.string()),
    children: z.array(z.union([z.string(), z.any()])),
  }),
  images: z.array(
    z.object({
      id: z.string(),
      src: z.string(),
      alt: z.string(),
    })
  ),
});

export async function generate({
  system,
  prompt,
}: {
  system?: string;
  prompt: string;
}) {
  const stream = createStreamableValue({});

  (async () => {
    const { partialObjectStream } = await streamObject({
      model: openai(MODEL),
      system: system,
      prompt: prompt,
      schema: schema,
      maxTokens: 16384,
      temperature: 1,
    });

    for await (const partialObject of partialObjectStream) {
      stream.update(partialObject as any);
    }

    stream.done();

    // const final = (stream.value as any)["curr"];
  })();

  return { output: stream.value };
}
