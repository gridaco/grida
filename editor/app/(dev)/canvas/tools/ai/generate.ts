"use server";

import {
  streamObject,
  experimental_generateImage,
  type CoreUserMessage,
  type UserContent,
  type TextPart,
  type FilePart,
  type ImagePart,
  type Tool,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { createStreamableValue } from "ai/rsc";
import { request_schema } from "./schema";
import assert from "assert";
import { z } from "zod";

const MODEL = process.env.NEXT_PUBLIC_OPENAI_BEST_MODEL_ID || "gpt-4o-mini";

export type UserAttachment = {
  type: "file" | "image";
  filename?: string;
  mimeType: string;
  url: string;
};

export async function generate({
  system,
  user,
  prompt,
  modelId,
  maxTokens = undefined,
  temperature = undefined,
  topP = undefined,
}: {
  system?: string;
  prompt?: string;
  user?: {
    text: string;
    attachments?: UserAttachment[];
  };
  modelId?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}) {
  const model = openai(modelId ?? MODEL);
  const model_config = {
    maxTokens: maxTokens,
    temperature: temperature,
    topP: topP,
  };

  assert(prompt || user, "Prompt or user is required");

  let message: CoreUserMessage | null = null;
  if (user) {
    const content: UserContent = [
      {
        type: "text",
        text: user.text,
      } satisfies TextPart,
    ];

    if (user.attachments) {
      const attatchments = user.attachments.map((f) => {
        switch (f.type) {
          case "file": {
            return {
              type: "file",
              data: f.url,
              filename: f.filename,
              mimeType: f.mimeType,
            } satisfies FilePart;
          }
          case "image": {
            return {
              type: "image",
              image: f.url,
              mimeType: f.mimeType,
            } satisfies ImagePart;
          }
        }
      });
      content.push(...attatchments);
    }

    message = {
      role: "user",
      content: content,
    };
  }

  const messages = {
    system: system,
    messages: message ? [message] : undefined,
    prompt: prompt,
  };

  const stream = createStreamableValue({});
  (async () => {
    const { partialObjectStream } = await streamObject({
      model,
      ...model_config,
      ...messages,
      schema: request_schema,
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
