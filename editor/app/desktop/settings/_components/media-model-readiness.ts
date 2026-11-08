import type { CurrentGGModel } from "@/lib/desktop/gg-models";

type ProviderBoundModel = Readonly<{
  providers?: object;
}>;

/** Settings readiness for models resolved through BYOK or Grida hosted media. */
export namespace MediaModelReadiness {
  /** Only old binaries use the finite legacy hosted contract. */
  export function hosted(
    id: string,
    kind: "image" | "video",
    current: readonly CurrentGGModel[] | null
  ): boolean | undefined {
    if (current === null) return undefined;
    return current.some(
      (model) =>
        model.id === id &&
        model.kind === kind &&
        (kind === "image"
          ? model.interfaces.includes("images.generations")
          : model.interfaces.includes("videos") &&
            model.client_supported_options?.video_text === true)
    );
  }

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
   * Current hosted discovery is independent of BYOK bindings. Only an older
   * binary without discovery uses its finite Vercel-backed hosted contract.
   * BYOK intersects connected providers with the exact native bindings.
   * Pending readiness stays pending unless another source proves availability.
   */
  export function visual(
    model: ProviderBoundModel,
    connectedByokProviderIds: ReadonlySet<string> | null,
    hostedActive: boolean | null,
    currentHosted?: boolean
  ): boolean | null {
    const providers = model.providers;
    if (!providers) return false;

    if (
      connectedByokProviderIds &&
      [...connectedByokProviderIds].some((providerId) =>
        Object.prototype.hasOwnProperty.call(providers, providerId)
      )
    ) {
      return true;
    }
    if (
      hostedActive === true &&
      (currentHosted ??
        Object.prototype.hasOwnProperty.call(providers, "vercel"))
    ) {
      return true;
    }
    if (connectedByokProviderIds === null || hostedActive === null) return null;
    return false;
  }
}
