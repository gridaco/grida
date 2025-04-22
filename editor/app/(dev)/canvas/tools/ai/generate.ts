"use server";

import { streamObject, experimental_generateImage } from "ai";
import { openai } from "@ai-sdk/openai";
import { createStreamableValue } from "ai/rsc";
import { request_schema } from "./schema";

const MODEL = process.env.NEXT_PUBLIC_OPENAI_BEST_MODEL_ID || "gpt-4o-mini";

export async function generate({
  system,
  prompt,
  modelId,
  maxTokens = undefined,
  temperature = undefined,
  topP = undefined,
}: {
  system?: string;
  prompt: string;
  modelId?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}) {
  const stream = createStreamableValue({});

  (async () => {
    const { partialObjectStream } = await streamObject({
      model: openai(modelId ?? MODEL),
      system: system,
      prompt: prompt,
      schema: request_schema,
      maxTokens: maxTokens,
      temperature: temperature,
      topP: topP,
    });

    for await (const partialObject of partialObjectStream) {
      stream.update(partialObject as any);
    }

    stream.done();

    // const final = (stream.value as any)["curr"];
  })();

  return { output: stream.value };
}

export async function generateImage(prompt: string) {
  const gen = await experimental_generateImage({
    model: openai.image("dall-e-3"),
    prompt: prompt,
    n: 1,
  });

  return {
    mimeType: gen.image.mimeType,
    base64: gen.image.base64,
  };
}
