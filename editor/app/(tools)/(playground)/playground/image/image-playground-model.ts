import models from "@grida/ai-models";

/** URL-to-playground model handoff. Generation authority remains server-side. */
export namespace ImagePlaygroundModel {
  export function initial(
    value: string | string[] | undefined
  ): models.image.ImageModelId | undefined {
    const requested = Array.isArray(value) ? value[0] : value;
    if (!requested) return undefined;
    const card = models.image.findImageModelCard(requested);
    return card?.listed ? card.id : undefined;
  }
}
