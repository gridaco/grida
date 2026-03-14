"use server";

import { streamText, Output } from "ai";
import { createStreamableValue } from "@ai-sdk/rsc";
import { GENzJSONForm } from "@/grida-forms/schema/zod";
import { service_role } from "@/lib/supabase/server";
import { model } from "@/lib/ai/models";

export async function generate(input: string, gist?: string) {
  const stream = createStreamableValue({});

  (async () => {
    const { partialOutputStream } = streamText({
      model: model("mini"),
      prompt: input,
      output: Output.object({ schema: GENzJSONForm }),
    });

    for await (const partialObject of partialOutputStream) {
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

      console.log("saved to gist", data?.id, error);
    }
  })();

  return { output: stream.value };
}
