import { models } from "@grida/ai-models";

type MediaModelCard = Readonly<{ id: string }>;

/** Catalogue selection and native-client compatibility for media models. */
export namespace MediaModelAvailability {
  export const imageUpdateMessage = "Update Grida Desktop to use this model";

  /** Desktop 0.0.22 first accepts image cards with partial provider coverage. */
  export function requiresImageUpdate(
    card:
      | Pick<models.image.ImageModelCard, "provider" | "providers">
      | undefined,
    desktopVersion?: string
  ): boolean {
    if (!card) return false;
    const needsNewParser =
      card.provider !== "vercel" ||
      models.image.providers.some((provider) => !card.providers[provider]);
    if (!needsNewParser) return false;
    const match = desktopVersion?.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) return true;
    const [major, minor, patch] = match.slice(1, 4).map(Number);
    return major === 0 && minor === 0 && patch < 22;
  }

  export function filter<T extends MediaModelCard>(
    catalogue: readonly T[],
    modelIds?: readonly string[]
  ): readonly T[] {
    if (modelIds === undefined) return catalogue;
    const allowed = new Set(modelIds);
    return catalogue.filter((model) => allowed.has(model.id));
  }
}
