/** GRIDA-SEC-016 — product recognition only supplies display metadata. */
import type { WebPreview } from "@grida/desktop-bridge";

export type WebPreviewProviderContext = Readonly<{
  url: string;
  signal: AbortSignal;
  metadata: Pick<WebPreview.Metadata, "title" | "description">;
  /** One bounded GET to the same loopback origin. */
  read(path: string): Promise<string | null>;
}>;

export type WebPreviewProvider = Readonly<{
  id: string;
  match: Readonly<{
    meta: string;
    attributes: Readonly<Record<string, string>>;
  }>;
  productLabel: string;
  resolve?(
    context: WebPreviewProviderContext
  ): Promise<Pick<WebPreview.Metadata, "title" | "description"> | null>;
}>;

type MetaTag = readonly Readonly<{ name: string; value: string }>[];

/** Matches trusted provider declarations against untrusted HTML head tags. */
export class WebPreviewProviderRegistry {
  readonly #providers = new Map<string, { provider: WebPreviewProvider }>();

  constructor(providers: readonly WebPreviewProvider[] = []) {
    for (const provider of providers) this.register(provider);
  }

  register(provider: WebPreviewProvider): () => boolean {
    const { id } = provider;
    if (this.#providers.has(id))
      throw new Error(`Duplicate web preview provider: ${id}`);
    const registration = { provider };
    this.#providers.set(id, registration);
    return () =>
      this.#providers.get(id) === registration && this.#providers.delete(id);
  }

  match(meta: readonly MetaTag[]): WebPreviewProvider | undefined {
    let match: WebPreviewProvider | undefined;
    for (const { provider } of this.#providers.values()) {
      const expected = Object.entries(provider.match.attributes);
      if (
        !meta.some(
          (tag) =>
            tag.some(
              ({ name, value }) =>
                name === "name" && value === provider.match.meta
            ) &&
            expected.every(([key, expectedValue]) =>
              tag.some(
                ({ name, value }) => name === key && value === expectedValue
              )
            )
        )
      )
        continue;
      if (match) return undefined;
      match = provider;
    }
    return match;
  }
}
