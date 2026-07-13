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
import {
  grida,
  model as tieredModel,
  gridaProviderOptions,
} from "@/lib/ai/server";
import assert from "assert";

export type UserAttachment = {
  type: "file" | "image";
  filename?: string;
  mimeType: string;
  url: string;
};

export async function generate({
  organizationId,
  system,
  user,
  prompt,
  modelId,
  maxOutputTokens = undefined,
  temperature = undefined,
  topP = undefined,
}: {
  /**
   * Verified organizationId — billed for this call. Caller is
   * responsible for threading from a verified context (workspace
   * shell / route param). See GRIDA-SEC-003.
   *
   * Optional only to make the dev-tool harness compile without a
   * workspace; when omitted the billed-path seam middleware throws
   * `MissingOrgIdError` at the first AI call. See GRIDA-SEC-003.
   */
  organizationId?: number;
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
  const model = modelId ? grida(modelId) : tieredModel("mini");
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
      providerOptions: gridaProviderOptions({
        organizationId,
        feature: "canvas/generate",
      }),
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
