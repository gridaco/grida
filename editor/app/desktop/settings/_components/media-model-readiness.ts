type ProviderBoundModel = Readonly<{
  providers?: object;
}>;

/** Settings readiness for models resolved through BYOK or Grida hosted media. */
export namespace MediaModelReadiness {
  /**
   * Hosted image/video resolution follows the catalogue's Vercel binding,
   * while BYOK resolution intersects every connected provider with the exact
   * bindings on this card. A pending source keeps the result pending unless
   * the other source has already proved the model runnable.
   */
  export function visual(
    model: ProviderBoundModel,
    connectedByokProviderIds: ReadonlySet<string> | null,
    hostedActive: boolean | null
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
      Object.prototype.hasOwnProperty.call(providers, "vercel")
    ) {
      return true;
    }
    if (connectedByokProviderIds === null || hostedActive === null) return null;
    return false;
  }
}
