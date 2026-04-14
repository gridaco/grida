"use server";

import {
  streamText,
  Output,
  type DeepPartial,
  type UserModelMessage,
  type UserContent,
  type TextPart,
  type FilePart,
  type ImagePart,
} from "ai";
import { createStreamableValue } from "@ai-sdk/rsc";
import { request_schema, type StreamingResponse } from "./schema";
import { gateway, model as tieredModel } from "@/lib/ai/models";
import assert from "assert";

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
  maxOutputTokens = undefined,
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
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
}) {
  // Dev tool: allow user-selected model override via the model selector UI;
  // fall back to the "mini" tier default.
  const model = modelId ? gateway(modelId) : tieredModel("mini");
  const model_config = {
    maxOutputTokens: maxOutputTokens,
    temperature: temperature,
    topP: topP,
  };

  assert(prompt || user, "Prompt or user is required");

  let message: UserModelMessage | null = null;
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
              mediaType: f.mimeType,
            } satisfies FilePart;
          }
          case "image": {
            return {
              type: "image",
              image: f.url,
              mediaType: f.mimeType,
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

  const stream = createStreamableValue<DeepPartial<StreamingResponse>>({});
  (async () => {
    const { partialOutputStream } = streamText({
      model,
      ...model_config,
      system,
      ...(message
        ? { messages: [message] }
        : { prompt: prompt ?? "Generate content" }),
      output: Output.object({ schema: request_schema }),
    });

    for await (const partialObject of partialOutputStream) {
      stream.update(partialObject);
    }

    stream.done();

    // const final = (stream.value as any)["curr"];
  })();

  return { output: stream.value };
}
