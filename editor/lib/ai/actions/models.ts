"use server";

// Anonymous catalogue lookup; no provider key or organization credit is needed.
import { hostedModelList } from "@/lib/ai/openai-compat/hosted-models";

export async function listHostedTextModels() {
  return {
    data: (await hostedModelList()).filter(
      (model) => model.grida.modality === "text"
    ),
  };
}
