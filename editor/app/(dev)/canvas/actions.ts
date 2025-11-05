"use server";

import { streamObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { createStreamableValue } from '@ai-sdk/rsc';
import { z } from 'zod/v3';

const title_description = z.object({
  h1: z.string().optional(),
  p: z.string().optional(),
});

const return_schema = z.object({
  changes: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
    })
  ),
});

export async function generate(prompt: string) {
  const stream = createStreamableValue({});

  (async () => {
    const { partialObjectStream } = await streamObject({
      model: openai("gpt-4o"),
      prompt: prompt,
      schema: return_schema,
    });

    for await (const partialObject of partialObjectStream) {
      stream.update(partialObject as any);
    }

    stream.done();
  })();

  return { output: stream.value };
}
