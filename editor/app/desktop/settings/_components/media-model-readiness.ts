import { catalog as models } from "@grida/ai-models/grida";
import { MediaModelAvailability } from "@/scaffolds/desktop/shared/media-model-availability";

/** Settings readiness for models resolved through BYOK or Grida hosted media. */
export namespace MediaModelReadiness {
  // GRIDA-GG: desktop — native feature support alone does not admit org credits.
  export function tripo(
    byok: boolean | null,
    hosted: boolean | null,
    hostedSupported: boolean
  ): boolean | null {
    if (byok === true || (hostedSupported && hosted === true)) return true;
    if (byok === null || (hostedSupported && hosted === null)) return null;
    return false;
  }
  /**
   * Reuse the playground's operation and native-version gates. A pending source
   * keeps readiness pending only if it could make this exact model runnable.
   */
  export function visual(
    kind: "image" | "video",
    modelId: string,
    connectedByokProviderIds: ReadonlySet<string> | null,
    hostedActive: boolean | null,
    desktopVersion: string | undefined
  ): boolean | null {
    const access = (assumePending: boolean) => {
      const state = {
        loaded: true,
        images: true,
        video: true,
        desktopVersion,
        configured: models[kind].providers.filter(
          (id) => connectedByokProviderIds?.has(id) ?? assumePending
        ),
        hosted: hostedActive ?? assumePending,
      };
      return kind === "image"
        ? MediaModelAvailability.image(models.image.models[modelId], state)
            .available
        : MediaModelAvailability.video(models.video.models[modelId], state)
            .available;
    };
    return access(false) ? true : access(true) ? null : false;
  }
}
