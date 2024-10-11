"use server";

import { streamObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { createStreamableValue } from "ai/rsc";
import { GENzJSONForm } from "@/types/zod";
import { grida_forms_client } from "@/lib/supabase/server";

export async function generate(input: string, gist?: string) {
  const stream = createStreamableValue({});

  (async () => {
    const { partialObjectStream } = await streamObject({
      model: openai("gpt-4o"),
      prompt: input,
      schema: GENzJSONForm,
    });

    for await (const partialObject of partialObjectStream) {
      stream.update(partialObject as any);
    }

    stream.done();

    // @ts-ignore
    const final = stream.value["curr"];

    if (gist) {
      const { error, data } = await grida_forms_client
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
