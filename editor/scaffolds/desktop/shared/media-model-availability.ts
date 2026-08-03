type MediaModelCard = Readonly<{ id: string }>;

/** Exact catalogue projection for an optional caller-owned model allowlist. */
export namespace MediaModelAvailability {
  export function filter<T extends MediaModelCard>(
    catalogue: readonly T[],
    modelIds?: readonly string[]
  ): readonly T[] {
    if (modelIds === undefined) return catalogue;
    const allowed = new Set(modelIds);
    return catalogue.filter((model) => allowed.has(model.id));
  }
}
