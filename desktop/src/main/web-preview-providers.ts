import { WebPreview } from "@grida/desktop-bridge";
import type { WebPreviewProvider } from "./web-preview-provider";

const declarations = import.meta.glob<unknown>(
  "../../../extensions/*/web-preview.json",
  { eager: true, import: "default" }
);
const manifests = import.meta.glob<unknown>(
  "../../../extensions/*/extension.json",
  { eager: true, import: "default" }
);
type Resolve = NonNullable<WebPreviewProvider["resolve"]>;
const resolvers = import.meta.glob<Resolve>(
  "../../../extensions/*/web-preview.ts",
  {
    eager: true,
    import: "resolve",
  }
);

/** Loads display-only providers from the bundled extension directories. */
export namespace WebPreviewProviders {
  export function bundled(): readonly WebPreviewProvider[] {
    return fromModules(declarations, manifests, resolvers);
  }

  export function fromModules(
    declarations: Readonly<Record<string, unknown>>,
    manifests: Readonly<Record<string, unknown>>,
    resolvers: Readonly<Record<string, Resolve>> = {}
  ): readonly WebPreviewProvider[] {
    const providers = new Map<string, WebPreviewProvider>();
    const duplicates = new Set<string>();
    for (const [path, value] of Object.entries(declarations)) {
      const manifest =
        manifests[path.replace(/web-preview\.json$/, "extension.json")];
      const provider = parse(manifest, value);
      if (!provider) continue;
      if (providers.has(provider.id)) duplicates.add(provider.id);
      const resolve = resolvers[path.replace(/\.json$/, ".ts")];
      providers.set(
        provider.id,
        typeof resolve === "function" ? { ...provider, resolve } : provider
      );
    }
    for (const id of duplicates) providers.delete(id);
    return [...providers.values()];
  }

  function parse(manifest: unknown, value: unknown): WebPreviewProvider | null {
    if (!record(manifest) || !record(value) || !record(value.match))
      return null;
    const { id } = manifest;
    const { meta, attributes } = value.match;
    const { productLabel } = value;
    if (
      typeof id !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ||
      typeof meta !== "string" ||
      !/^[a-z][a-z0-9_.:-]{0,63}$/.test(meta) ||
      typeof productLabel !== "string" ||
      !productLabel.trim() ||
      productLabel.length > WebPreview.MAX_PRODUCT_LABEL ||
      /[\p{Cc}\p{Cf}]/u.test(productLabel) ||
      !record(attributes)
    )
      return null;
    const entries = Object.entries(attributes);
    if (
      entries.length === 0 ||
      entries.length > 8 ||
      entries.some(
        ([key, value]) =>
          key === "name" ||
          !/^[a-z][a-z0-9_.:-]{0,63}$/.test(key) ||
          typeof value !== "string" ||
          value.length > 256
      )
    )
      return null;
    return {
      id,
      match: {
        meta,
        attributes: Object.fromEntries(entries) as Readonly<
          Record<string, string>
        >,
      },
      productLabel: productLabel.trim(),
    };
  }

  function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
