import type { models } from "@grida/ai-models";

/**
 * Editorial inventory for dedicated `/ai/models/:slug` pages.
 *
 * This is deliberately separate from `@grida/ai-models`:
 *
 * - the package owns intrinsic model facts, provider bindings, and pricing;
 * - this module owns whether a model deserves a public search page and how
 *   that page is retired.
 *
 * Only shipped pages belong in `active`. Plans do not. A page is added here in
 * the same change that makes its route real, and every sitemap/metadata/static
 * parameter consumer derives from this inventory.
 */
export namespace aiModelPages {
  /** Text models are intentionally absent: they are too broad for this surface. */
  export type MediaModelReference =
    | { catalogue: "image"; id: models.image.ImageModelId }
    | { catalogue: "video"; id: models.video.VideoModelId }
    | { catalogue: "music"; id: models.audio.music.ModelId }
    | {
        catalogue: "sound-effect";
        id: models.audio.sound_effects.ModelId;
      }
    | { catalogue: "3d"; id: models.three_d.ThreeDModelId };

  export type Demo =
    | { placement: "embedded" }
    | { placement: "routed"; href: `/${string}` };

  export type Entry = {
    /** Stable, lowercase, human-readable URL segment. */
    slug: string;
    /**
     * Editorial direct-successor lineage, not a provider id. At most one
     * active page may represent a lineage.
     */
    successorLineage: string;
    /** One page may honestly cover multiple endpoints or variants in a family. */
    models: readonly [MediaModelReference, ...MediaModelReference[]];
    /** The concrete user search intent that earns this page its existence. */
    publishReason: string;
    /**
     * Human-reviewable removal condition. A direct same-family successor with
     * no distinct search intent—especially at the same price—normally replaces
     * this page instead of creating another one. Variants that are not direct
     * successors may use distinct lineages.
     */
    retireWhen: string;
    metadata: {
      title: string;
      description: string;
      keywords: readonly string[];
    };
    demo: Demo;
  };

  export type RetiredEntry = {
    slug: string;
    reason: string;
    disposition:
      | { kind: "redirect"; destination: `/ai/models/${string}` }
      | { kind: "removed" };
  };

  /**
   * The routable, indexable inventory. Keep this active-only: no drafts and no
   * text-model entries.
   */
  export const active: readonly Entry[] = [];

  /**
   * Published slugs that left the active inventory. Keep successor redirects
   * here so an established URL is not accidentally reused or orphaned.
   */
  export const retired: readonly RetiredEntry[] = [];

  export function path(slug: string): `/ai/models/${string}` {
    return `/ai/models/${slug}`;
  }

  export function url(slug: string): `https://grida.co/ai/models/${string}` {
    return `https://grida.co${path(slug)}`;
  }

  export function bySlug(slug: string): Entry | undefined {
    return active.find((page) => page.slug === slug);
  }
}
