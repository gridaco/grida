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

  /**
   * A web runner that exists today. Keep this union strict: adding a runner is
   * the point where a modality proves its cookie-authenticated web execution
   * path, rather than merely having a catalogue or Desktop integration.
   */
  export type Demo =
    {
      runner: "image-playground";
      placement: "routed";
      href: `/playground/image?model=${string}`;
    };

  export type EditorialContent = {
    /** Model-specific prose; catalogue summaries alone are not page content. */
    overview: string;
    capabilities: readonly {
      title: string;
      description: string;
    }[];
  };

  export type Entry = {
    /** Stable, lowercase, human-readable URL segment. */
    slug: string;
    /**
     * Editorial direct-successor lineage, not a provider id. At most one
     * active page may represent a lineage.
     */
    successorLineage: string;
    /** The one catalogue model this page describes and its demo selects. */
    model: MediaModelReference;
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
    content: EditorialContent;
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
  export const active: readonly Entry[] = [
    {
      slug: "gpt-image-2",
      successorLineage: "openai-gpt-image",
      model: { catalogue: "image", id: "openai/gpt-image-2" },
      publishReason:
        "GPT Image 2 is Grida's current OpenAI image-generation page and matches direct model-name search intent.",
      retireWhen:
        "Redirect when Grida supports a direct GPT Image successor and the older model no longer serves a distinct search or product need.",
      metadata: {
        title: "GPT Image 2 AI Image Generator — Grida",
        description:
          "Generate images with OpenAI GPT Image 2 in Grida. Review its output sizes and published pricing, then try it with organization AI credit.",
        keywords: [
          "gpt image 2",
          "gpt image 2 generator",
          "openai image generator",
          "ai image generator",
        ],
      },
      content: {
        overview:
          "GPT Image 2 is OpenAI’s current image model for generation and editing. This Grida demo exposes its text-to-image path, placing generated results directly on a canvas where you can compare prompts and outputs.",
        capabilities: [
          {
            title: "Prompt-to-image generation",
            description:
              "Describe an image in natural language and generate a new visual directly in the Grida playground.",
          },
          {
            title: "Flexible output geometry",
            description:
              "The model supports square, portrait, and landscape presets, plus custom dimensions inside its published size envelope.",
          },
          {
            title: "Generation and editing model",
            description:
              "GPT Image 2 supports both new-image generation and provider-specific reference editing. The current Grida demo is text-to-image only.",
          },
        ],
      },
      demo: {
        runner: "image-playground",
        placement: "routed",
        href: "/playground/image?model=openai%2Fgpt-image-2",
      },
    },
  ];

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

  export function byModel(
    reference: MediaModelReference
  ): Entry | undefined {
    return active.find(
      (page) =>
        page.model.catalogue === reference.catalogue &&
        page.model.id === reference.id
    );
  }
}
