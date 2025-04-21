"use server";

import { streamObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { createStreamableValue } from "ai/rsc";
import { GENzJSONForm } from "@/types/zod";
import { service_role } from "@/lib/supabase/server";

const MODEL = process.env.NEXT_PUBLIC_OPENAI_BEST_MODEL_ID || "gpt-4o-mini";

export async function generate(input: string, gist?: string) {
  const stream = createStreamableValue({});

  (async () => {
    const { partialObjectStream } = await streamObject({
      model: openai(MODEL),
      prompt: input,
      schema: GENzJSONForm,
    });

    for await (const partialObject of partialObjectStream) {
      stream.update(partialObject as any);
    }

    stream.done();

    const final = (stream.value as any)["curr"];

    if (gist) {
      const { error, data } = await service_role.forms
        .from("gist")
        .update({
          slug: gist,
          data: {
            "form.json": JSON.stringify(final, null, 2),
          },
        })
        .eq("slug", gist)
        .select()
        .single();

      console.log("Saved to gist", data, error);
    }
  })();

  return { output: stream.value };
}
