/**
 * The id-matching rules, over an arbitrary spec table.
 *
 * Private to this file and parameterized rather than closed over
 * `catalogSpecs` so that `models.text.modelSpecById` (the bundled
 * catalogue) and consumer-supplied factual subsets match ids identically.
 * Two copies of these rules would drift the day a
 * provider changes its id convention.
 *
 * Accepts an exact namespaced id, a bare id, or a date-suffixed id —
 * see {@link models.text.modelSpecById} for the contract.
 */
function specByIdOver(
  specs: readonly models.text.ModelSpec[],
  modelId: string
): models.text.ModelSpec | undefined {
  for (const spec of specs) {
    if (spec.id === modelId) return spec;

    const baseName = spec.id.includes("/")
      ? spec.id.split("/").slice(1).join("/")
      : spec.id;

    if (modelId === baseName) return spec;
    if (
      modelId.startsWith(baseName) &&
      /^-\d/.test(modelId.slice(baseName.length))
    ) {
      return spec;
    }
  }
  return undefined;
}

/**
 * Open-registry resolution over an arbitrary spec table ∪ `custom`.
 * The table wins on a collision; custom ids match exactly. Shared by
 * built-in and caller-supplied registries, so precedence is stated once.
 */
function resolveOver(
  specs: readonly models.text.ModelSpec[],
  modelId: string,
  custom?: readonly models.text.registry.CustomModelSpec[]
): models.text.registry.ResolvedModelSpec | undefined {
  const fromTable = specByIdOver(specs, modelId);
  if (fromTable) return { ...fromTable, custom: false };
  const fromCustom = custom?.find((m) => m.id === modelId);
  return fromCustom ? models.text.registry.normalize(fromCustom) : undefined;
}

/**
 * Card lookup over an arbitrary media table for image-model lookups.
 *
 * Accepts an exact namespaced id or a bare post-slash name. Unlike
 * {@link specByIdOver} there is no date-suffix tolerance — media providers
 * don't snapshot ids the way text ones do.
 */
function cardByIdOver<Card extends { id: string }>(
  cards: Record<string, Card | undefined>,
  modelId: string
): Card | undefined {
  if (!modelId) return undefined;
  if (modelId.includes("/")) return cards[modelId] ?? undefined;
  for (const card of Object.values(cards)) {
    if (!card) continue;
    const slash = card.id.indexOf("/");
    if (slash >= 0 && card.id.slice(slash + 1) === modelId) return card;
  }
  return undefined;
}

export namespace models {
  // ── Shared discriminators ─────────────────────────────────────────

  /**
   * Routing label for hosted-provider calls. `"vercel"` indicates
   * the model is served via the Vercel AI Gateway; the label is
   * data, not an SDK directive.
   */
  export type Provider = "vercel";

  /**
   * Model vendor (the organization that produced the weights).
   * Display label only — the routing-target discriminator is
   * `Provider`, not `Vendor`.
   */
  export type Vendor =
    | "tripo"
    | "openai"
    | "recraft-ai"
    | "black-forest-labs"
    | "google"
    | "microsoft"
    | "tencent"
    | "elevenlabs"
    | "stability-ai"
    | "bytedance"
    | "xai"
    | "alibaba"
    | "meta";

  /** Calendar date serialized as `YYYY-MM-DD`. Runtime snapshot parsing also
   * validates that the value is a real Gregorian calendar date. */
  export type ISODate = `${number}-${number}-${number}`;

  /** What the release date describes. Model dates are intrinsic and therefore
   * shared by every provider binding; endpoint dates describe a serving route
   * when no exact upstream model launch can be established. */
  export type ModelReleaseBasis = "model" | "provider_endpoint";

  /**
   * Source-backed release metadata.
   *
   * `date` is the first broad public availability of the exact named model or
   * variant; public preview counts, closed/limited preview does not. A missing
   * exact date is represented as `null`, never guessed, and is only valid for
   * a provider endpoint whose linked history does not expose a day.
   */
  export type ModelRelease =
    | Readonly<{
        date: ISODate;
        basis: ModelReleaseBasis;
        source_url: string;
      }>
    | Readonly<{
        date: null;
        basis: "provider_endpoint";
        source_url: string;
      }>;

  // ── models.text ───────────────────────────────────────────────────
  //
  // Text-model spec catalogue. Single source of truth for per-model
  // metadata. Values from https://models.dev/api.json — to look up:
  // `python .tools/model_info.py <id>`.

  export namespace text {
    /**
     * Cost per 1M tokens in USD.
     *
     * Values from models.dev — direct provider pricing (not reseller
     * markup).
     */
    export interface ModelCostPerMillion {
      /** USD per 1M input tokens. */
      input: number;
      /** USD per 1M output tokens. */
      output: number;
      /** USD per 1M cached input tokens (read). `undefined` if not supported. */
      cacheRead?: number;
      /** USD per 1M cached input tokens (write). `undefined` if not supported. */
      cacheWrite?: number;
      /** Optional request-wide long-context pricing rule. */
      longContext?: {
        /** Apply when total input tokens are strictly greater than this value. */
        inputTokensAbove: number;
        /** Multiplier for every input bucket, including cache reads and writes. */
        inputMultiplier: number;
        /** Multiplier for every output bucket, including reasoning tokens. */
        outputMultiplier: number;
      };
    }

    /** An exact image media type accepted as model input. */
    export type ImageInputMime = `image/${string}`;

    export interface ModelSpec {
      /** Provider-namespaced model id (`creator/model-name`). */
      id: string;
      /** Human-readable label (full name, e.g. "Claude Opus 4.8"). */
      label: string;
      /**
       * Optional compact name for space-constrained UI (e.g. "Opus 4.8").
       * Manually curated — not derived. Falls back to {@link label} when
       * unset; use {@link displayLabel} to resolve.
       */
      short_label?: string;
      /**
       * Source-backed first public release. Optional only so custom models and
       * pre-field catalogue snapshots remain readable; every bundled entry has
       * it.
       */
      release?: ModelRelease;
      /** Whether the model accepts image/file inputs. */
      multimodal: boolean;
      /**
       * Exact image MIME types accepted natively by the model. This is sourced
       * independently from {@link multimodal}: a broad multimodal declaration
       * never manufactures formats, and provider-specific constraints beyond
       * MIME type still apply.
       */
      readonly imageInputMimes: readonly ImageInputMime[];
      /**
       * Whether the model supports native tool/function calling. Explicit
       * on every entry — the agent loop is tool-heavy, so this flag gates
       * "can this model drive the agent at all" decisions downstream.
       */
      tool_call: boolean;
      /** Maximum context window in tokens (input + output combined). */
      contextWindow: number;
      /** Maximum output tokens per response. */
      outputLimit: number;
      /** Cost per 1M tokens in USD. */
      cost: ModelCostPerMillion;
    }

    /** A bundled text-model spec. Unlike the snapshot-compatible base shape,
     * every built-in has grounded release metadata. */
    type BundledModelSpec = ModelSpec & { release: ModelRelease };

    const catalogSpecs =
      /* generated:facts:text.catalog:start */
      {
        "openai/gpt-5.5": {
          id: "openai/gpt-5.5",
          label: "GPT-5.5",
          release: {
            date: "2026-04-23",
            basis: "model",
            source_url: "https://openai.com/index/introducing-gpt-5-5/",
          },
          multimodal: true,
          imageInputMimes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
          ],
          tool_call: true,
          contextWindow: 1050000,
          outputLimit: 128000,
          cost: {
            input: 5,
            output: 30,
            cacheRead: 0.5,
            longContext: {
              inputTokensAbove: 272000,
              inputMultiplier: 2,
              outputMultiplier: 1.5,
            },
          },
        },
        "openai/gpt-5.5-pro": {
          id: "openai/gpt-5.5-pro",
          label: "GPT-5.5 Pro",
          release: {
            date: "2026-04-23",
            basis: "model",
            source_url: "https://openai.com/index/introducing-gpt-5-5/",
          },
          multimodal: true,
          imageInputMimes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
          ],
          tool_call: true,
          contextWindow: 1050000,
          outputLimit: 128000,
          cost: {
            input: 30,
            output: 180,
          },
        },
        "openai/gpt-5.6-sol": {
          id: "openai/gpt-5.6-sol",
          label: "GPT-5.6 Sol",
          release: {
            date: "2026-07-09",
            basis: "model",
            source_url: "https://openai.com/index/gpt-5-6/",
          },
          multimodal: true,
          imageInputMimes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
          ],
          tool_call: true,
          contextWindow: 1050000,
          outputLimit: 128000,
          cost: {
            input: 4,
            output: 20,
            cacheRead: 0.4,
            cacheWrite: 5,
            longContext: {
              inputTokensAbove: 272000,
              inputMultiplier: 2,
              outputMultiplier: 1.5,
            },
          },
        },
        "openai/gpt-5.6-terra": {
          id: "openai/gpt-5.6-terra",
          label: "GPT-5.6 Terra",
          release: {
            date: "2026-07-09",
            basis: "model",
            source_url: "https://openai.com/index/gpt-5-6/",
          },
          multimodal: true,
          imageInputMimes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
          ],
          tool_call: true,
          contextWindow: 1050000,
          outputLimit: 128000,
          cost: {
            input: 2,
            output: 12,
            cacheRead: 0.2,
            cacheWrite: 2.5,
            longContext: {
              inputTokensAbove: 272000,
              inputMultiplier: 2,
              outputMultiplier: 1.5,
            },
          },
        },
        "openai/gpt-5.6-luna": {
          id: "openai/gpt-5.6-luna",
          label: "GPT-5.6 Luna",
          release: {
            date: "2026-07-09",
            basis: "model",
            source_url: "https://openai.com/index/gpt-5-6/",
          },
          multimodal: true,
          imageInputMimes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
          ],
          tool_call: true,
          contextWindow: 1050000,
          outputLimit: 128000,
          cost: {
            input: 0.2,
            output: 1.2,
            cacheRead: 0.02,
            cacheWrite: 0.25,
            longContext: {
              inputTokensAbove: 272000,
              inputMultiplier: 2,
              outputMultiplier: 1.5,
            },
          },
        },
        "openai/gpt-6-astra": {
          id: "openai/gpt-6-astra",
          label: "GPT-6 Astra",
          release: {
            date: "2026-09-04",
            basis: "provider_endpoint",
            source_url: "https://vercel.com/ai-gateway/models/gpt-6-astra",
          },
          multimodal: true,
          imageInputMimes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
          ],
          tool_call: true,
          contextWindow: 1050000,
          outputLimit: 128000,
          cost: {
            input: 10,
            output: 50,
            cacheRead: 1,
            cacheWrite: 12.5,
            longContext: {
              inputTokensAbove: 272000,
              inputMultiplier: 2,
              outputMultiplier: 1.5,
            },
          },
        },
        "anthropic/claude-sonnet-5": {
          id: "anthropic/claude-sonnet-5",
          label: "Claude Sonnet 5",
          release: {
            date: "2026-06-30",
            basis: "model",
            source_url:
              "https://platform.claude.com/docs/en/release-notes/overview",
          },
          short_label: "Sonnet 5",
          multimodal: true,
          imageInputMimes: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
          ],
          tool_call: true,
          contextWindow: 1000000,
          outputLimit: 128000,
          cost: {
            input: 2,
            output: 10,
            cacheRead: 0.2,
            cacheWrite: 2.5,
          },
        },
        "anthropic/claude-fable-5.1": {
          id: "anthropic/claude-fable-5.1",
          label: "Claude Fable 5.1",
          release: {
            date: "2026-09-01",
            basis: "model",
            source_url:
              "https://platform.claude.com/docs/en/models/fable-5-1/overview",
          },
          short_label: "Fable 5.1",
          multimodal: true,
          imageInputMimes: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
          ],
          tool_call: true,
          contextWindow: 1000000,
          outputLimit: 128000,
          cost: {
            input: 10,
            output: 50,
            cacheRead: 0.25,
            cacheWrite: 12.5,
          },
        },
        "anthropic/claude-fable-5": {
          id: "anthropic/claude-fable-5",
          label: "Claude Fable 5",
          release: {
            date: "2026-06-09",
            basis: "model",
            source_url:
              "https://platform.claude.com/docs/en/release-notes/overview",
          },
          short_label: "Fable 5",
          multimodal: true,
          imageInputMimes: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
          ],
          tool_call: true,
          contextWindow: 1000000,
          outputLimit: 128000,
          cost: {
            input: 10,
            output: 50,
            cacheRead: 1,
            cacheWrite: 12.5,
          },
        },
        "anthropic/claude-opus-5": {
          id: "anthropic/claude-opus-5",
          label: "Claude Opus 5",
          release: {
            date: "2026-07-24",
            basis: "model",
            source_url:
              "https://platform.claude.com/docs/en/release-notes/overview",
          },
          short_label: "Opus 5",
          multimodal: true,
          imageInputMimes: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
          ],
          tool_call: true,
          contextWindow: 1000000,
          outputLimit: 128000,
          cost: {
            input: 5,
            output: 25,
            cacheRead: 0.5,
            cacheWrite: 6.25,
          },
        },
        "anthropic/claude-opus-4.8": {
          id: "anthropic/claude-opus-4.8",
          label: "Claude Opus 4.8",
          release: {
            date: "2026-05-28",
            basis: "model",
            source_url:
              "https://platform.claude.com/docs/en/release-notes/overview",
          },
          short_label: "Opus 4.8",
          multimodal: true,
          imageInputMimes: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
          ],
          tool_call: true,
          contextWindow: 1000000,
          outputLimit: 128000,
          cost: {
            input: 5,
            output: 25,
            cacheRead: 0.5,
            cacheWrite: 6.25,
          },
        },
        "google/gemini-3.8-flash": {
          id: "google/gemini-3.8-flash",
          label: "Gemini 3.8 Flash",
          release: {
            date: "2026-09-02",
            basis: "model",
            source_url: "https://ai.google.dev/gemini-api/docs/changelog",
          },
          multimodal: true,
          imageInputMimes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/heic",
            "image/heif",
          ],
          tool_call: true,
          contextWindow: 1048576,
          outputLimit: 65536,
          cost: {
            input: 1.5,
            output: 7.5,
            cacheRead: 0.15,
          },
        },
        "google/gemini-3.7-flash": {
          id: "google/gemini-3.7-flash",
          label: "Gemini 3.7 Flash",
          release: {
            date: "2026-08-13",
            basis: "model",
            source_url: "https://ai.google.dev/gemini-api/docs/changelog",
          },
          multimodal: true,
          imageInputMimes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/heic",
            "image/heif",
          ],
          tool_call: true,
          contextWindow: 1048576,
          outputLimit: 65536,
          cost: {
            input: 1.5,
            output: 7.5,
            cacheRead: 0.15,
          },
        },
        "google/gemini-3.1-pro-preview": {
          id: "google/gemini-3.1-pro-preview",
          label: "Gemini 3.1 Pro Preview",
          release: {
            date: "2026-02-19",
            basis: "model",
            source_url: "https://ai.google.dev/gemini-api/docs/changelog",
          },
          short_label: "Gemini 3.1 Pro",
          multimodal: true,
          imageInputMimes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/heic",
            "image/heif",
          ],
          tool_call: true,
          contextWindow: 1048576,
          outputLimit: 65536,
          cost: {
            input: 2,
            output: 12,
            cacheRead: 0.2,
            longContext: {
              inputTokensAbove: 200000,
              inputMultiplier: 2,
              outputMultiplier: 1.5,
            },
          },
        },
      } /* generated:facts:text.catalog:end */ as const satisfies Record<
        string,
        BundledModelSpec
      >;

    /** Catalogued text-model id. The literal key set of {@link catalog}. */
    export type CatalogId = keyof typeof catalogSpecs;

    /** Read-only map of catalog model id → spec. */
    export const catalog: Record<
      CatalogId,
      ModelSpec & { release: ModelRelease }
    > = catalogSpecs;

    /**
     * Look up a model spec by id.
     *
     * Accepts:
     * - Namespaced id: `"openai/gpt-5.6-luna"` (exact match)
     * - Bare id: `"gpt-5.6-luna"` (matches `openai/gpt-5.6-luna`)
     * - Date-suffixed id: `"gpt-5.6-luna-2026-07-30"` (providers often
     *   append a snapshot date in their API responses)
     */
    export function modelSpecById(
      modelId: string,
      specs: readonly ModelSpec[] = Object.values(catalogSpecs)
    ): ModelSpec | undefined {
      return specByIdOver(specs, modelId);
    }

    /**
     * The label to show in UI: the curated short name ({@link ModelSpec.short_label})
     * if present, otherwise the full {@link ModelSpec.label}. Centralizes the
     * fallback so call sites never repeat `spec.short_label ?? spec.label`.
     */
    export function displayLabel(spec: ModelSpec): string {
      return spec.short_label ?? spec.label;
    }

    // ── models.text.registry ──────────────────────────────────────────
    //
    // The open-registry seam (issue #806): spec resolution over the
    // static catalogue PLUS caller-supplied user-registered models (local
    // Ollama models, self-hosted OpenAI-compatible gateways). Pure data —
    // the caller owns where the custom list comes from (agent-host config,
    // renderer fetch); this namespace only normalizes and resolves.

    export namespace registry {
      /**
       * A user-registered text model — a model the static catalogue does
       * not know (e.g. `llama3.1:8b` served by a local Ollama). Everything
       * but the id is optional; {@link normalize} fills defaults.
       *
       * `cost` is optional by design: local models are free/unmetered, and
       * a registered model must be first-class without a price card.
       */
      export interface CustomModelSpec {
        /** Provider-side model id, verbatim (e.g. `"llama3.1:8b"`). */
        id: string;
        /** Display label. Falls back to the id. */
        label?: string;
        /** Whether the model accepts image/file inputs. Default `false`. */
        multimodal?: boolean;
        /**
         * Exact image MIME types declared by the model host. Default empty.
         * A non-empty declaration makes the normalized model multimodal; the
         * inverse is deliberately not inferred.
         */
        readonly imageInputMimes?: readonly ImageInputMime[];
        /**
         * Whether the model supports native tool/function calling.
         * Default `true` (permissive) — consumers warn rather than block
         * when this is explicitly `false`.
         */
        tool_call?: boolean;
        /** Context window in tokens. Default {@link CUSTOM_MODEL_DEFAULTS}. */
        contextWindow?: number;
        /** Max output tokens per response. Default {@link CUSTOM_MODEL_DEFAULTS}. */
        outputLimit?: number;
        /** Cost per 1M tokens in USD. Absent for local/unmetered models. */
        cost?: ModelCostPerMillion;
      }

      /**
       * A spec resolved through the open registry: either a catalogue
       * {@link ModelSpec} (cost present, `custom: false`) or a normalized
       * {@link CustomModelSpec} (cost may be absent, `custom: true`).
       */
      export interface ResolvedModelSpec extends Omit<ModelSpec, "cost"> {
        cost?: ModelCostPerMillion;
        /** True when the spec came from the caller's custom list. */
        custom: boolean;
      }

      /**
       * Defaults applied to a {@link CustomModelSpec} by {@link normalize}.
       *
       * The context window is deliberately conservative: overflowing a
       * local model's real window kills the session mid-run, while a too-
       * small assumption merely compacts early. 8k matches the common
       * Ollama serving default; users with larger windows raise it in the
       * model's config.
       */
      export const CUSTOM_MODEL_DEFAULTS = {
        multimodal: false,
        imageInputMimes: [] as readonly ImageInputMime[],
        tool_call: true,
        contextWindow: 8_192,
        outputLimit: 4_096,
      } as const;

      /** Fill a custom spec's gaps with {@link CUSTOM_MODEL_DEFAULTS}. */
      export function normalize(spec: CustomModelSpec): ResolvedModelSpec {
        const imageInputMimes = spec.imageInputMimes
          ? [...spec.imageInputMimes]
          : CUSTOM_MODEL_DEFAULTS.imageInputMimes;
        return {
          id: spec.id,
          label: spec.label && spec.label.length > 0 ? spec.label : spec.id,
          multimodal:
            imageInputMimes.length > 0 ||
            (spec.multimodal ?? CUSTOM_MODEL_DEFAULTS.multimodal),
          imageInputMimes,
          tool_call: spec.tool_call ?? CUSTOM_MODEL_DEFAULTS.tool_call,
          contextWindow:
            spec.contextWindow ?? CUSTOM_MODEL_DEFAULTS.contextWindow,
          outputLimit: spec.outputLimit ?? CUSTOM_MODEL_DEFAULTS.outputLimit,
          cost: spec.cost && {
            ...spec.cost,
            ...(spec.cost.longContext
              ? { longContext: { ...spec.cost.longContext } }
              : {}),
          },
          custom: true,
        };
      }

      /**
       * Resolve a model id over catalogue ∪ custom. The catalogue wins on
       * a collision (it carries curated labels + real pricing); custom ids
       * match exactly — local ids like `llama3.1:8b` have no namespacing
       * convention to fuzzy-match on.
       */
      export function resolve(
        modelId: string,
        custom?: readonly CustomModelSpec[],
        specs: readonly ModelSpec[] = Object.values(catalogSpecs)
      ): ResolvedModelSpec | undefined {
        return resolveOver(specs, modelId, custom);
      }
    }
  }

  // ── models.image ──────────────────────────────────────────────────

  export namespace image {
    /**
     * @deprecated Use `ImageModelId` directly and inspect explicit bindings.
     */
    export type ProviderModel = {
      provider: "vercel";
      modelId: ImageModelId;
    };

    /**
     * Image-model ids in `creator/model-name` format.
     */
    export type ImageModelId =
      // OpenAI
      | "openai/gpt-image-2"
      | "openai/gpt-image-2.5-flare"
      | "openai/gpt-image-2.5-sunburst"
      | "openai/gpt-image-1.5"
      | "openai/gpt-image-1-mini"
      // Google (multimodal LLMs with image output)
      | "google/gemini-3.1-flash-image-preview"
      | "google/gemini-3.1-flash-lite-image"
      | "google/gemini-3-pro-image"
      // Black Forest Labs
      | "bfl/flux-2-pro"
      | "bfl/flux-2-max"
      | "bfl/flux-kontext-max"
      | "bfl/flux-kontext-pro"
      | "bfl/flux-pro-1.1"
      // ByteDance
      | "bytedance/seedream-5.0-pro"
      | "bytedance/seedream-5.0-lite"
      | "bytedance/seedream-4.5"
      // SpaceXAI
      | "xai/grok-imagine-image-2.0"
      // Meta
      | "meta/muse-image-1.0"
      // Recraft
      | "recraft/recraft-v4.1"
      | "recraft/recraft-v3"
      | (string & {});

    export type AspectRatioString = `${number}:${number}`;

    export type SizeString = `${number}x${number}`;

    export type SizeSpec = [number, number, AspectRatioString];

    /**
     * Coarse speed bucket. Shared by image and audio cards so a
     * single ordering can sort across catalogues.
     */
    export type SpeedLabel = "fastest" | "fast" | "medium" | "slow" | "slowest";

    // ── Pricing ─────────────────────────────────────────────────────

    /**
     * Per-token rate sheet, in USD per **1 million** tokens.
     *
     * The authoritative pricing unit for token-billed models. For
     * tiered/flat per-image pricing, the same provider often publishes
     * an equivalent token-based meter — store it here so that arbitrary
     * sizes (outside the tiered map) can be priced exactly.
     *
     * Providers that distinguish text-input vs image-input modalities
     * (e.g. OpenAI image models) populate both `input` and `image_input`,
     * each with its own optional cached counterpart. Models that bill all
     * inputs uniformly (e.g. Google Gemini) leave the image-side fields
     * unset.
     */
    export type PerTokenRates = {
      /** USD per 1M text input tokens. */
      input: number;
      /** USD per 1M cached text input tokens. */
      cached_input?: number;
      /** USD per 1M image input tokens (edits/refs). */
      image_input?: number;
      /** USD per 1M cached image input tokens. */
      cached_image_input?: number;
      /** USD per 1M text output tokens, when the provider bills them separately. */
      text_output?: number;
      /**
       * USD per 1M output tokens.
       *
       * For image models this is the image-output rate. Some providers
       * publish a separate text-output rate for multimodal flows; that's
       * out of scope for this spec.
       */
      output: number;
    };

    /**
     * Per-image pricing with quality × size tiers (e.g. OpenAI).
     *
     * Values from the provider's official pricing page.
     */
    export type PerImageTieredPricing = {
      type: "per_image_tiered";
      /** USD per image, keyed by `"quality/WxH"` (e.g. `"medium/1024x1024"`). */
      tiers: Record<string, number>;
      /**
       * Authoritative underlying per-token rates.
       *
       * `tiers` covers the provider's published per-image equivalents for
       * popular sizes; arbitrary in-envelope sizes (see
       * {@link ImageSizeConstraints}) are billed by token count using
       * these rates. Always present when the provider documents a token
       * meter for the model.
       */
      tokens?: PerTokenRates;
    };

    /**
     * Flat per-image pricing (e.g. BFL Flux models).
     */
    export type PerImageFlatPricing = {
      type: "per_image_flat";
      /** USD per image. */
      usd: number;
    };

    /**
     * Per-token pricing (e.g. Google Gemini image models).
     */
    export type PerTokenPricing = PerTokenRates & {
      type: "per_token";
    };

    /**
     * Discriminated union of all image-model pricing schemes.
     *
     * Each variant stores the **real** provider pricing — no averages
     * or estimates.
     */
    export type ImageModelPricing =
      | PerImageTieredPricing
      | PerImageFlatPricing
      | PerTokenPricing;

    // ── Providers ───────────────────────────────────────────────────

    /**
     * Every provider that can serve an image model, as a value.
     *
     * The runtime list is the SOURCE and {@link ImageProvider} is derived
     * from it — a resolver iterating providers and the type gating them can
     * then never disagree. Adding a provider is one edit here.
     */
    export const providers = ["vercel", "fal", "openrouter"] as const;

    /**
     * A provider that can serve an image model. Distinct from the top-level
     * {@link models.Provider} because the same flagship proprietary model is
     * now multi-homed: fal, OpenRouter, and the Vercel AI Gateway each serve it
     * under a different id (and sometimes a different meter). Mirrors
     * {@link video.VideoProvider}.
     */
    export type ImageProvider = (typeof providers)[number];

    /**
     * How one provider serves an image model: the id you actually call on that
     * provider, plus that provider's own meter. The unit of provider-selection.
     * Keyed by {@link ImageProvider} in {@link ImageModelCard.providers}, so
     * `provider` here must equal that key. Mirrors {@link video.VideoProviderBinding}.
     */
    export type ImageProviderBinding = {
      provider: ImageProvider;
      /**
       * Provider-specific call id, e.g. `openai/gpt-image-2` (Vercel AI Gateway) or
       * `openai/gpt-image-2.5/flare/text-to-image` (fal).
       */
      id: string;
      /** Real upstream pricing for **this** provider — meters differ across providers. */
      pricing: ImageModelPricing;
      /**
       * Coarse provider cost per invocation in USD. For budget estimation;
       * not for display.
       */
      avg_cost_usd: number;
      /** Per-binding deprecation (a provider may retire a route independently). */
      deprecated?: boolean;
      /** Provider's page for this binding; UI falls back to the card. */
      url?: string;
      /**
       * Native transparent-background support across {@link id} and any
       * advertised {@link references} route. Booleans override the model;
       * `null` means unverified and blocks inheritance. Omission deliberately
       * inherits the model declaration only after verifying these endpoints.
       * Background-removal postprocessing does not count as native support.
       */
      transparent_background?: boolean | null;
      /**
       * Image-to-image (reference-conditioned generation) support for **this**
       * provider's route. Absent ⇒ the provider serves text-to-image only for
       * this model, so the resolver won't route a reference-bearing call here.
       *
       * - `id` — the endpoint to call when references are present. Equals
       *   {@link id} where edit is the same endpoint plus an extra field
       *   (OpenRouter: `input_references`); a **distinct** id where the provider
       *   separates the routes (fal: `…/edit`). Carrying it explicitly keeps the
       *   resolver honest instead of string-munging the t2i id.
       * - `max` — the provider-advertised maximum number of reference images
       *   (OpenRouter `supported_parameters.input_references.max`). One reference
       *   = single-image edit; many = multi-reference composition.
       *
       * Populate only against a provider that has been verified to serve it (the
       * TOOL-DESIGN doctrine: don't catalogue a capability that doesn't work).
       */
      references?: { id: string; max: number };
    };

    // ── Size constraints ────────────────────────────────────────────

    /**
     * Continuous size constraints for an image model.
     *
     * Models accept arbitrary widths and heights within these bounds.
     * Use alongside (or instead of) `sizes` (discrete presets):
     *
     * - **Presets only** — fixed-size models (legacy OpenAI image).
     * - **Constraints only** — fully flexible (Flux, Gemini).
     * - **Both** — `gpt-image-2`: documented preset prices plus arbitrary
     *   sizes within the engine's pixel/aspect envelope.
     *
     * **Validation precedence.** When both `sizes` (presets) and
     * `constraints` are present on a card, `constraints` is the
     * authoritative validator: a request must satisfy every constraint
     * field. `sizes` is a UI hint and a pricing-tier anchor — off-preset
     * but in-envelope requests are valid, but their cost falls back to
     * the nearest priced tier (see `PerImageTieredPricing`).
     *
     * All bounds are inclusive. Omit a field when the provider does not
     * document that constraint.
     */
    export type ImageSizeConstraints = {
      /**
       * Pixel quantization. Width and height must be multiples of `step`.
       * Default `1` (no quantization).
       *
       * @example 16 // gpt-image-2
       */
      step?: number;
      /** Per-edge bounds, in px. Applies symmetrically to width and height. */
      min_edge?: number;
      max_edge?: number;
      /** Total pixel-count bounds (`width × height`). */
      min_pixels?: number;
      max_pixels?: number;
      /**
       * Aspect-ratio bounds, expressed as the long edge over the short
       * edge (always `>= 1`). Applies in either orientation.
       *
       * @example { max: 3 } // up to 3:1
       */
      aspect_ratio?: {
        min?: number;
        max?: number;
      };
    };

    export type ImageModelCard = {
      id: ImageModelId;
      label: string;
      short_description: string;
      /** Optional only for backwards-compatible snapshot parsing. */
      release?: ModelRelease;
      vendor: Vendor;
      /**
       * Providers that serve this model, keyed by provider. **No implied
       * preference** — default-provider selection is deferred to the runtime
       * resolver. Mirrors {@link video.VideoModelCard.providers}.
       */
      providers: Partial<Record<ImageProvider, ImageProviderBinding>>;
      styles: string[] | null;
      speed_label: SpeedLabel;
      speed_max: string;
      /** Discrete preset sizes (UI suggestions and pricing-tier anchors). */
      sizes: SizeSpec[] | null;
      /**
       * Continuous size constraints for arbitrary dimensions.
       * Authoritative for input validation when present (see
       * {@link ImageSizeConstraints}).
       */
      constraints: ImageSizeConstraints | null;
      /** Provider-documented quality choices; independent of the pricing unit. */
      quality?: { options: string[]; default: string };
      /**
       * Native transparent-background generation: `true` supported, `false`
       * unsupported, absent unknown. Provider bindings may override this;
       * use {@link supportsTransparentBackground} for a specific provider.
       */
      transparent_background?: boolean;
      /** Real provider pricing data. */
      pricing: ImageModelPricing;
      /**
       * Coarse estimate of cost per invocation in USD. For flat
       * per-image models this equals the exact price; for tiered
       * models it is the mid-tier (medium quality, default size);
       * for per-token models it is a rough estimate. Not for display.
       */
      avg_cost_usd: number;
    };

    type CatalogCard = ImageModelCard & {
      release: ModelRelease;
    };

    export const models: Partial<
      Record<ImageModelId, CatalogCard>
    > /* generated:facts:image.models:start */ = {
      "openai/gpt-image-2": {
        id: "openai/gpt-image-2",
        label: "GPT Image 2",
        release: {
          date: "2026-04-21",
          basis: "model",
          source_url:
            "https://developers.openai.com/api/docs/models/gpt-image-2",
        },
        short_description:
          "Previous-generation image model. Superseded by GPT Image 2.5.",
        vendor: "openai",
        transparent_background: true,
        providers: {
          vercel: {
            provider: "vercel",
            id: "openai/gpt-image-2",
            pricing: {
              type: "per_token",
              input: 5,
              output: 30,
            },
            avg_cost_usd: 0.053,
            transparent_background: null,
          },
          openrouter: {
            provider: "openrouter",
            id: "openai/gpt-image-2",
            pricing: {
              type: "per_token",
              input: 8,
              output: 8,
            },
            avg_cost_usd: 0.05,
            url: "https://openrouter.ai/openai/gpt-image-2",
            transparent_background: false,
            references: {
              id: "openai/gpt-image-2",
              max: 16,
            },
          },
          fal: {
            provider: "fal",
            id: "fal-ai/gpt-image-2",
            pricing: {
              type: "per_image_tiered",
              tiers: {
                "low/1024x1024": 0.006,
                "medium/1024x1024": 0.053,
                "high/1024x1024": 0.211,
              },
            },
            avg_cost_usd: 0.053,
            url: "https://fal.ai/models/openai/gpt-image-2",
          },
        },
        speed_label: "medium",
        speed_max: "1m",
        styles: null,
        sizes: [
          [1024, 1024, "1:1"],
          [1024, 1536, "2:3"],
          [1536, 1024, "3:2"],
        ],
        constraints: {
          step: 16,
          max_edge: 3840,
          min_pixels: 655360,
          max_pixels: 8294400,
          aspect_ratio: {
            max: 3,
          },
        },
        pricing: {
          type: "per_image_tiered",
          tiers: {
            "low/1024x1024": 0.006,
            "low/1024x1536": 0.005,
            "low/1536x1024": 0.005,
            "medium/1024x1024": 0.053,
            "medium/1024x1536": 0.041,
            "medium/1536x1024": 0.041,
            "high/1024x1024": 0.211,
            "high/1024x1536": 0.165,
            "high/1536x1024": 0.165,
          },
          tokens: {
            input: 5,
            cached_input: 1.25,
            image_input: 8,
            cached_image_input: 2,
            output: 30,
          },
        },
        avg_cost_usd: 0.053,
      },
      "openai/gpt-image-2.5-flare": {
        id: "openai/gpt-image-2.5-flare",
        label: "GPT Image 2.5 Flare",
        release: {
          date: "2026-09-08",
          basis: "model",
          source_url:
            "https://openai.com/index/introducing-chatgpt-images-2-5/",
        },
        short_description:
          "Fast image generation and reference-guided editing.",
        vendor: "openai",
        transparent_background: true,
        providers: {
          vercel: {
            provider: "vercel",
            id: "openai/gpt-image-2.5-flare",
            pricing: {
              type: "per_token",
              input: 5,
              cached_input: 1.25,
              output: 30,
            },
            avg_cost_usd: 0.055,
            url: "https://vercel.com/ai-gateway/models/gpt-image-2.5-flare",
          },
          openrouter: {
            provider: "openrouter",
            id: "openai/gpt-image-2.5-flare",
            pricing: {
              type: "per_token",
              input: 5,
              image_input: 8,
              output: 30,
            },
            avg_cost_usd: 0.055,
            url: "https://openrouter.ai/openai/gpt-image-2.5-flare",
            transparent_background: false,
            references: {
              id: "openai/gpt-image-2.5-flare",
              max: 16,
            },
          },
          fal: {
            provider: "fal",
            id: "openai/gpt-image-2.5/flare/text-to-image",
            pricing: {
              type: "per_token",
              input: 5,
              cached_input: 1.25,
              image_input: 8,
              cached_image_input: 2,
              text_output: 10,
              output: 30,
            },
            avg_cost_usd: 0.055,
            url: "https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image",
            references: {
              id: "openai/gpt-image-2.5/flare/edit",
              max: 16,
            },
          },
        },
        speed_label: "fast",
        speed_max: "varies",
        styles: null,
        sizes: [
          [1024, 1024, "1:1"],
          [1024, 1536, "2:3"],
          [1536, 1024, "3:2"],
        ],
        constraints: {
          step: 16,
          max_edge: 3840,
          min_pixels: 655360,
          max_pixels: 8294400,
          aspect_ratio: {
            max: 3,
          },
        },
        quality: {
          options: ["auto", "low", "medium", "high", "xhigh", "max"],
          default: "high",
        },
        pricing: {
          type: "per_token",
          input: 5,
          cached_input: 1.25,
          output: 30,
        },
        avg_cost_usd: 0.055,
      },
      "openai/gpt-image-2.5-sunburst": {
        id: "openai/gpt-image-2.5-sunburst",
        label: "GPT Image 2.5 Sunburst",
        release: {
          date: "2026-09-08",
          basis: "model",
          source_url:
            "https://openai.com/index/introducing-chatgpt-images-2-5/",
        },
        short_description:
          "Detailed image generation and precise editing with longer generation times.",
        vendor: "openai",
        transparent_background: true,
        providers: {
          vercel: {
            provider: "vercel",
            id: "openai/gpt-image-2.5-sunburst",
            pricing: {
              type: "per_token",
              input: 5,
              cached_input: 1.25,
              output: 30,
            },
            avg_cost_usd: 0.055,
            url: "https://vercel.com/ai-gateway/models/gpt-image-2.5-sunburst",
          },
          openrouter: {
            provider: "openrouter",
            id: "openai/gpt-image-2.5-sunburst",
            pricing: {
              type: "per_token",
              input: 5,
              image_input: 8,
              output: 30,
            },
            avg_cost_usd: 0.055,
            url: "https://openrouter.ai/openai/gpt-image-2.5-sunburst",
            transparent_background: false,
            references: {
              id: "openai/gpt-image-2.5-sunburst",
              max: 16,
            },
          },
          fal: {
            provider: "fal",
            id: "openai/gpt-image-2.5/sunburst/text-to-image",
            pricing: {
              type: "per_token",
              input: 5,
              cached_input: 1.25,
              image_input: 8,
              cached_image_input: 2,
              text_output: 10,
              output: 30,
            },
            avg_cost_usd: 0.055,
            url: "https://fal.ai/models/openai/gpt-image-2.5/sunburst/text-to-image",
            references: {
              id: "openai/gpt-image-2.5/sunburst/edit",
              max: 16,
            },
          },
        },
        speed_label: "slow",
        speed_max: "varies",
        styles: null,
        sizes: [
          [1024, 1024, "1:1"],
          [1024, 1536, "2:3"],
          [1536, 1024, "3:2"],
        ],
        constraints: {
          step: 16,
          max_edge: 3840,
          min_pixels: 655360,
          max_pixels: 8294400,
          aspect_ratio: {
            max: 3,
          },
        },
        quality: {
          options: ["auto", "low", "medium", "high", "xhigh", "max"],
          default: "high",
        },
        pricing: {
          type: "per_token",
          input: 5,
          cached_input: 1.25,
          output: 30,
        },
        avg_cost_usd: 0.055,
      },
      "openai/gpt-image-1.5": {
        id: "openai/gpt-image-1.5",
        label: "GPT Image 1.5",
        release: {
          date: "2025-12-16",
          basis: "model",
          source_url: "https://openai.com/index/new-chatgpt-images-is-here/",
        },
        short_description:
          "Previous-generation image model. Superseded by GPT Image 2.",
        vendor: "openai",
        providers: {
          vercel: {
            provider: "vercel",
            id: "openai/gpt-image-1.5",
            pricing: {
              type: "per_token",
              input: 5,
              output: 32,
            },
            avg_cost_usd: 0.034,
          },
        },
        speed_label: "medium",
        speed_max: "1m",
        styles: null,
        sizes: [
          [1024, 1024, "1:1"],
          [1024, 1536, "2:3"],
          [1536, 1024, "3:2"],
        ],
        constraints: null,
        pricing: {
          type: "per_image_tiered",
          tiers: {
            "low/1024x1024": 0.009,
            "low/1024x1536": 0.013,
            "low/1536x1024": 0.013,
            "medium/1024x1024": 0.034,
            "medium/1024x1536": 0.05,
            "medium/1536x1024": 0.05,
            "high/1024x1024": 0.133,
            "high/1024x1536": 0.2,
            "high/1536x1024": 0.2,
          },
          tokens: {
            input: 5,
            cached_input: 1.25,
            image_input: 8,
            cached_image_input: 2,
            output: 32,
          },
        },
        avg_cost_usd: 0.034,
      },
      "openai/gpt-image-1-mini": {
        id: "openai/gpt-image-1-mini",
        label: "GPT Image Mini",
        release: {
          date: "2025-10-06",
          basis: "model",
          source_url: "https://openai.com/devday/",
        },
        short_description: "Cost-efficient image generation model",
        vendor: "openai",
        providers: {
          vercel: {
            provider: "vercel",
            id: "openai/gpt-image-1-mini",
            pricing: {
              type: "per_token",
              input: 2,
              output: 8,
            },
            avg_cost_usd: 0.011,
          },
        },
        speed_label: "slow",
        speed_max: "1m",
        styles: null,
        sizes: [
          [1024, 1024, "1:1"],
          [1024, 1536, "2:3"],
          [1536, 1024, "3:2"],
        ],
        constraints: null,
        pricing: {
          type: "per_image_tiered",
          tiers: {
            "low/1024x1024": 0.005,
            "low/1024x1536": 0.006,
            "low/1536x1024": 0.006,
            "medium/1024x1024": 0.011,
            "medium/1024x1536": 0.015,
            "medium/1536x1024": 0.015,
            "high/1024x1024": 0.036,
            "high/1024x1536": 0.052,
            "high/1536x1024": 0.052,
          },
          tokens: {
            input: 2,
            cached_input: 0.2,
            image_input: 2.5,
            cached_image_input: 0.25,
            output: 8,
          },
        },
        avg_cost_usd: 0.011,
      },
      "google/gemini-3.1-flash-image-preview": {
        id: "google/gemini-3.1-flash-image-preview",
        label: "Gemini 3.1 Flash Image",
        release: {
          date: "2026-02-26",
          basis: "model",
          source_url: "https://ai.google.dev/gemini-api/docs/changelog",
        },
        short_description:
          "Fast, efficient multimodal model with native image generation",
        vendor: "google",
        providers: {
          vercel: {
            provider: "vercel",
            id: "google/gemini-3.1-flash-image",
            pricing: {
              type: "per_token",
              input: 0.5,
              output: 3,
            },
            avg_cost_usd: 0.004,
          },
          openrouter: {
            provider: "openrouter",
            id: "google/gemini-3.1-flash-image",
            pricing: {
              type: "per_token",
              input: 0.5,
              output: 3,
            },
            avg_cost_usd: 0.004,
            url: "https://openrouter.ai/google/gemini-3.1-flash-image",
            references: {
              id: "google/gemini-3.1-flash-image",
              max: 14,
            },
          },
          fal: {
            provider: "fal",
            id: "fal-ai/nano-banana-2",
            pricing: {
              type: "per_image_flat",
              usd: 0.08,
            },
            avg_cost_usd: 0.08,
            url: "https://fal.ai/models/fal-ai/nano-banana-2",
          },
        },
        speed_label: "fast",
        speed_max: "15s",
        styles: null,
        sizes: null,
        constraints: {
          max_edge: 1536,
        },
        pricing: {
          type: "per_token",
          input: 0.5,
          output: 3,
        },
        avg_cost_usd: 0.004,
      },
      "google/gemini-3-pro-image": {
        id: "google/gemini-3-pro-image",
        label: "Gemini 3 Pro Image",
        release: {
          date: "2025-11-20",
          basis: "model",
          source_url:
            "https://blog.google/innovation-and-ai/products/nano-banana-pro/",
        },
        short_description:
          "High-quality multimodal model with native image generation",
        vendor: "google",
        providers: {
          vercel: {
            provider: "vercel",
            id: "google/gemini-3-pro-image",
            pricing: {
              type: "per_token",
              input: 2,
              output: 12,
            },
            avg_cost_usd: 0.015,
          },
          openrouter: {
            provider: "openrouter",
            id: "google/gemini-3-pro-image-preview",
            pricing: {
              type: "per_token",
              input: 2,
              output: 12,
            },
            avg_cost_usd: 0.015,
            url: "https://openrouter.ai/google/gemini-3-pro-image-preview",
            references: {
              id: "google/gemini-3-pro-image-preview",
              max: 14,
            },
          },
          fal: {
            provider: "fal",
            id: "fal-ai/nano-banana-pro",
            pricing: {
              type: "per_image_flat",
              usd: 0.15,
            },
            avg_cost_usd: 0.15,
            url: "https://fal.ai/models/fal-ai/nano-banana-pro",
          },
        },
        speed_label: "medium",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: {
          max_edge: 1536,
        },
        pricing: {
          type: "per_token",
          input: 2,
          output: 12,
        },
        avg_cost_usd: 0.015,
      },
      "google/gemini-3.1-flash-lite-image": {
        id: "google/gemini-3.1-flash-lite-image",
        label: "Gemini 3.1 Flash Lite Image",
        release: {
          date: "2026-06-30",
          basis: "model",
          source_url: "https://ai.google.dev/gemini-api/docs/changelog",
        },
        short_description:
          "Fastest, most cost-efficient Gemini image model; 1K output only.",
        vendor: "google",
        providers: {
          vercel: {
            provider: "vercel",
            id: "google/gemini-3.1-flash-lite-image",
            pricing: {
              type: "per_token",
              input: 0.25,
              output: 1.5,
            },
            avg_cost_usd: 0.034,
          },
          openrouter: {
            provider: "openrouter",
            id: "google/gemini-3.1-flash-lite-image",
            pricing: {
              type: "per_token",
              input: 0.25,
              output: 1.5,
            },
            avg_cost_usd: 0.034,
            url: "https://openrouter.ai/google/gemini-3.1-flash-lite-image",
          },
        },
        speed_label: "fastest",
        speed_max: "10s",
        styles: null,
        sizes: null,
        constraints: {
          max_edge: 1024,
        },
        pricing: {
          type: "per_token",
          input: 0.25,
          output: 1.5,
        },
        avg_cost_usd: 0.034,
      },
      "bfl/flux-2-pro": {
        id: "bfl/flux-2-pro",
        label: "Flux 2 Pro",
        release: {
          date: "2025-11-25",
          basis: "model",
          source_url: "https://bfl.ai/blog/flux-2",
        },
        short_description:
          "Latest Flux model with best-in-class image quality and prompt adherence",
        vendor: "black-forest-labs",
        providers: {
          vercel: {
            provider: "vercel",
            id: "bfl/flux-2-pro",
            pricing: {
              type: "per_image_flat",
              usd: 0.03,
            },
            avg_cost_usd: 0.03,
          },
          openrouter: {
            provider: "openrouter",
            id: "black-forest-labs/flux.2-pro",
            pricing: {
              type: "per_image_flat",
              usd: 0.03,
            },
            avg_cost_usd: 0.03,
            url: "https://openrouter.ai/black-forest-labs/flux.2-pro",
            references: {
              id: "black-forest-labs/flux.2-pro",
              max: 8,
            },
          },
          fal: {
            provider: "fal",
            id: "fal-ai/flux-2-pro",
            pricing: {
              type: "per_image_flat",
              usd: 0.03,
            },
            avg_cost_usd: 0.03,
            url: "https://fal.ai/models/fal-ai/flux-2-pro",
          },
        },
        speed_label: "medium",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: {
          min_edge: 256,
          max_edge: 1440,
        },
        pricing: {
          type: "per_image_flat",
          usd: 0.03,
        },
        avg_cost_usd: 0.03,
      },
      "bfl/flux-2-max": {
        id: "bfl/flux-2-max",
        label: "Flux 2 Max",
        release: {
          date: "2025-12-16",
          basis: "model",
          source_url: "https://playground.bfl.ai/changelog",
        },
        short_description:
          "Black Forest Labs' highest-fidelity Flux 2 — maximum prompt adherence and detail.",
        vendor: "black-forest-labs",
        providers: {
          vercel: {
            provider: "vercel",
            id: "bfl/flux-2-max",
            pricing: {
              type: "per_image_flat",
              usd: 0.07,
            },
            avg_cost_usd: 0.07,
          },
          openrouter: {
            provider: "openrouter",
            id: "black-forest-labs/flux.2-max",
            pricing: {
              type: "per_image_flat",
              usd: 0.07,
            },
            avg_cost_usd: 0.07,
            url: "https://openrouter.ai/black-forest-labs/flux.2-max",
            references: {
              id: "black-forest-labs/flux.2-max",
              max: 8,
            },
          },
          fal: {
            provider: "fal",
            id: "fal-ai/flux-2-max",
            pricing: {
              type: "per_image_flat",
              usd: 0.07,
            },
            avg_cost_usd: 0.07,
            url: "https://fal.ai/models/fal-ai/flux-2-max",
          },
        },
        speed_label: "slow",
        speed_max: "45s",
        styles: null,
        sizes: null,
        constraints: {
          min_edge: 256,
          max_edge: 1440,
        },
        pricing: {
          type: "per_image_flat",
          usd: 0.07,
        },
        avg_cost_usd: 0.07,
      },
      "bfl/flux-kontext-max": {
        id: "bfl/flux-kontext-max",
        label: "Flux Kontext Max",
        release: {
          date: "2025-05-29",
          basis: "model",
          source_url: "https://bfl.ai/blog/flux-1-kontext",
        },
        short_description:
          "Highest quality Flux model for context-aware image generation and editing",
        vendor: "black-forest-labs",
        providers: {
          vercel: {
            provider: "vercel",
            id: "bfl/flux-kontext-max",
            pricing: {
              type: "per_image_flat",
              usd: 0.08,
            },
            avg_cost_usd: 0.08,
          },
          fal: {
            provider: "fal",
            id: "fal-ai/flux-pro/kontext/max",
            pricing: {
              type: "per_image_flat",
              usd: 0.08,
            },
            avg_cost_usd: 0.08,
            url: "https://fal.ai/models/fal-ai/flux-pro/kontext/max",
          },
        },
        speed_label: "slow",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: {
          max_edge: 1820,
        },
        pricing: {
          type: "per_image_flat",
          usd: 0.08,
        },
        avg_cost_usd: 0.08,
      },
      "bfl/flux-kontext-pro": {
        id: "bfl/flux-kontext-pro",
        label: "Flux Kontext Pro",
        release: {
          date: "2025-05-29",
          basis: "model",
          source_url: "https://bfl.ai/blog/flux-1-kontext",
        },
        short_description: "Fast context-aware image generation and editing",
        vendor: "black-forest-labs",
        providers: {
          vercel: {
            provider: "vercel",
            id: "bfl/flux-kontext-pro",
            pricing: {
              type: "per_image_flat",
              usd: 0.04,
            },
            avg_cost_usd: 0.04,
          },
          fal: {
            provider: "fal",
            id: "fal-ai/flux-pro/kontext",
            pricing: {
              type: "per_image_flat",
              usd: 0.04,
            },
            avg_cost_usd: 0.04,
            url: "https://fal.ai/models/fal-ai/flux-pro/kontext",
          },
        },
        speed_label: "medium",
        speed_max: "20s",
        styles: null,
        sizes: null,
        constraints: {
          max_edge: 1820,
        },
        pricing: {
          type: "per_image_flat",
          usd: 0.04,
        },
        avg_cost_usd: 0.04,
      },
      "bfl/flux-pro-1.1": {
        id: "bfl/flux-pro-1.1",
        label: "Flux Pro 1.1",
        release: {
          date: "2024-10-02",
          basis: "model",
          source_url: "https://bfl.ai/blog/24-10-02-flux",
        },
        short_description:
          "Faster, better FLUX Pro. Text-to-image model with excellent image quality and output diversity.",
        vendor: "black-forest-labs",
        providers: {
          vercel: {
            provider: "vercel",
            id: "bfl/flux-pro-1.1",
            pricing: {
              type: "per_image_flat",
              usd: 0.04,
            },
            avg_cost_usd: 0.04,
          },
        },
        speed_label: "slow",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: {
          min_edge: 256,
          max_edge: 1440,
        },
        pricing: {
          type: "per_image_flat",
          usd: 0.04,
        },
        avg_cost_usd: 0.04,
      },
      "bytedance/seedream-5.0-pro": {
        id: "bytedance/seedream-5.0-pro",
        label: "Seedream 5.0 Pro",
        release: {
          date: "2026-07-08",
          basis: "model",
          source_url:
            "https://seed.bytedance.com/en/blog/beyond-generation-it-understands-design-introducing-seedream-5-0-pro",
        },
        short_description:
          "ByteDance's flagship image model — dense layouts, infographics and text-heavy compositions at 1K–2K.",
        vendor: "bytedance",
        providers: {
          vercel: {
            provider: "vercel",
            id: "bytedance/seedream-5.0-pro",
            pricing: {
              type: "per_image_flat",
              usd: 0.035,
            },
            avg_cost_usd: 0.035,
          },
          openrouter: {
            provider: "openrouter",
            id: "bytedance-seed/seedream-5-0-pro",
            pricing: {
              type: "per_image_flat",
              usd: 0.045,
            },
            avg_cost_usd: 0.045,
            url: "https://openrouter.ai/bytedance-seed/seedream-5-0-pro",
            references: {
              id: "bytedance-seed/seedream-5-0-pro",
              max: 14,
            },
          },
          fal: {
            provider: "fal",
            id: "bytedance/seedream/v5/pro/text-to-image",
            pricing: {
              type: "per_image_flat",
              usd: 0.0675,
            },
            avg_cost_usd: 0.0675,
            url: "https://fal.ai/models/bytedance/seedream/v5/pro/text-to-image",
          },
        },
        speed_label: "medium",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: {
          min_pixels: 1048576,
          max_pixels: 4194304,
          aspect_ratio: {
            max: 16,
          },
        },
        pricing: {
          type: "per_image_flat",
          usd: 0.035,
        },
        avg_cost_usd: 0.035,
      },
      "bytedance/seedream-5.0-lite": {
        id: "bytedance/seedream-5.0-lite",
        label: "Seedream 5.0 Lite",
        release: {
          date: "2026-02-13",
          basis: "model",
          source_url:
            "https://seed.bytedance.com/en/blog/deeper-thinking-more-accurate-generation-introducing-seedream-5-0-lite",
        },
        short_description:
          "ByteDance's fast 2K–4K image model — Seedream 5.0 quality at the 4.5 price point.",
        vendor: "bytedance",
        providers: {
          vercel: {
            provider: "vercel",
            id: "bytedance/seedream-5.0-lite",
            pricing: {
              type: "per_image_flat",
              usd: 0.035,
            },
            avg_cost_usd: 0.035,
          },
          openrouter: {
            provider: "openrouter",
            id: "bytedance-seed/seedream-5-0-lite",
            pricing: {
              type: "per_image_flat",
              usd: 0.035,
            },
            avg_cost_usd: 0.035,
            url: "https://openrouter.ai/bytedance-seed/seedream-5-0-lite",
            references: {
              id: "bytedance-seed/seedream-5-0-lite",
              max: 14,
            },
          },
          fal: {
            provider: "fal",
            id: "bytedance/seedream/v5/lite/text-to-image",
            pricing: {
              type: "per_image_flat",
              usd: 0.035,
            },
            avg_cost_usd: 0.035,
            url: "https://fal.ai/models/bytedance/seedream/v5/lite/text-to-image",
          },
        },
        speed_label: "fast",
        speed_max: "15s",
        styles: null,
        sizes: null,
        constraints: {
          min_pixels: 3686400,
          max_pixels: 16777216,
        },
        pricing: {
          type: "per_image_flat",
          usd: 0.035,
        },
        avg_cost_usd: 0.035,
      },
      "bytedance/seedream-4.5": {
        id: "bytedance/seedream-4.5",
        label: "Seedream 4.5",
        release: {
          date: "2025-12-03",
          basis: "model",
          source_url:
            "https://blog.fal.ai/seedream-4-5-is-now-available-on-fal/",
        },
        short_description:
          "ByteDance's unified image generation and editing model.",
        vendor: "bytedance",
        providers: {
          vercel: {
            provider: "vercel",
            id: "bytedance/seedream-4.5",
            pricing: {
              type: "per_image_flat",
              usd: 0.04,
            },
            avg_cost_usd: 0.04,
          },
          openrouter: {
            provider: "openrouter",
            id: "bytedance-seed/seedream-4.5",
            pricing: {
              type: "per_image_flat",
              usd: 0.04,
            },
            avg_cost_usd: 0.04,
            url: "https://openrouter.ai/bytedance-seed/seedream-4.5",
            references: {
              id: "bytedance-seed/seedream-4.5",
              max: 14,
            },
          },
          fal: {
            provider: "fal",
            id: "fal-ai/bytedance/seedream/v4.5/text-to-image",
            pricing: {
              type: "per_image_flat",
              usd: 0.04,
            },
            avg_cost_usd: 0.04,
            url: "https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/text-to-image",
          },
        },
        speed_label: "fast",
        speed_max: "15s",
        styles: null,
        sizes: null,
        constraints: {
          max_edge: 4096,
        },
        pricing: {
          type: "per_image_flat",
          usd: 0.04,
        },
        avg_cost_usd: 0.04,
      },
      "xai/grok-imagine-image-2.0": {
        id: "xai/grok-imagine-image-2.0",
        label: "Grok Imagine Image 2.0",
        release: {
          date: "2026-08-07",
          basis: "model",
          source_url: "https://x.ai/news/grok-imagine-image-2",
        },
        short_description:
          "SpaceXAI's image model — fast 1K/2K generation with a low-cost quality tier.",
        vendor: "xai",
        providers: {
          vercel: {
            provider: "vercel",
            id: "spacexai/grok-imagine-image-2.0",
            pricing: {
              type: "per_image_tiered",
              tiers: {
                "low/1024x1024": 0.04,
                "medium/1024x1024": 0.06,
                "low/2048x2048": 0.06,
                "medium/2048x2048": 0.08,
              },
            },
            avg_cost_usd: 0.06,
          },
          openrouter: {
            provider: "openrouter",
            id: "x-ai/grok-imagine-image-2.0",
            pricing: {
              type: "per_image_tiered",
              tiers: {
                "low/1024x1024": 0.04,
                "medium/1024x1024": 0.06,
                "low/2048x2048": 0.06,
                "medium/2048x2048": 0.08,
              },
            },
            avg_cost_usd: 0.06,
            url: "https://openrouter.ai/x-ai/grok-imagine-image-2.0",
            references: {
              id: "x-ai/grok-imagine-image-2.0",
              max: 3,
            },
          },
          fal: {
            provider: "fal",
            id: "xai/grok-imagine-image/v2.0/text-to-image",
            pricing: {
              type: "per_image_tiered",
              tiers: {
                "low/1024x1024": 0.04,
                "medium/1024x1024": 0.06,
                "low/2048x2048": 0.06,
                "medium/2048x2048": 0.08,
              },
            },
            avg_cost_usd: 0.06,
            url: "https://fal.ai/models/xai/grok-imagine-image/v2.0/text-to-image",
          },
        },
        speed_label: "fast",
        speed_max: "15s",
        styles: null,
        sizes: null,
        constraints: {
          max_edge: 2048,
        },
        pricing: {
          type: "per_image_tiered",
          tiers: {
            "low/1024x1024": 0.04,
            "medium/1024x1024": 0.06,
            "low/2048x2048": 0.06,
            "medium/2048x2048": 0.08,
          },
        },
        avg_cost_usd: 0.06,
      },
      "meta/muse-image-1.0": {
        id: "meta/muse-image-1.0",
        label: "Muse Image 1.0",
        release: {
          date: "2026-07-07",
          basis: "model",
          source_url:
            "https://about.fb.com/news/2026/07/introducing-muse-image-meta-ai/",
        },
        short_description:
          "Meta's agentic image model — reasons before it renders; generates and edits from text and references.",
        vendor: "meta",
        providers: {
          vercel: {
            provider: "vercel",
            id: "meta/muse-image-1.0",
            pricing: {
              type: "per_image_flat",
              usd: 0.01,
            },
            avg_cost_usd: 0.01,
          },
          fal: {
            provider: "fal",
            id: "meta/muse-image/text-to-image",
            pricing: {
              type: "per_image_flat",
              usd: 0.01,
            },
            avg_cost_usd: 0.01,
            url: "https://fal.ai/models/meta/muse-image/text-to-image",
          },
        },
        speed_label: "medium",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: null,
        pricing: {
          type: "per_image_flat",
          usd: 0.01,
        },
        avg_cost_usd: 0.01,
      },
      "recraft/recraft-v4.1": {
        id: "recraft/recraft-v4.1",
        label: "Recraft V4.1",
        release: {
          date: "2026-05-14",
          basis: "model",
          source_url:
            "https://www.recraft.ai/blog/recraft-v4-1-more-beautiful-by-nature",
        },
        short_description:
          "Design-first image model — sharper prompt control and production-ready raster for brand and editorial work.",
        vendor: "recraft-ai",
        providers: {
          vercel: {
            provider: "vercel",
            id: "recraft/recraft-v4.1",
            pricing: {
              type: "per_image_flat",
              usd: 0.035,
            },
            avg_cost_usd: 0.035,
          },
          openrouter: {
            provider: "openrouter",
            id: "recraft/recraft-v4.1",
            pricing: {
              type: "per_image_flat",
              usd: 0.035,
            },
            avg_cost_usd: 0.035,
            url: "https://openrouter.ai/recraft/recraft-v4.1",
            references: {
              id: "recraft/recraft-v4.1",
              max: 1,
            },
          },
          fal: {
            provider: "fal",
            id: "fal-ai/recraft/v4.1/text-to-image",
            pricing: {
              type: "per_image_flat",
              usd: 0.035,
            },
            avg_cost_usd: 0.035,
            url: "https://fal.ai/models/fal-ai/recraft/v4.1/text-to-image",
          },
        },
        speed_label: "medium",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: {
          max_edge: 2048,
        },
        pricing: {
          type: "per_image_flat",
          usd: 0.035,
        },
        avg_cost_usd: 0.035,
      },
      "recraft/recraft-v3": {
        id: "recraft/recraft-v3",
        label: "Recraft V3",
        release: {
          date: "2024-10-30",
          basis: "model",
          source_url:
            "https://www.recraft.ai/blog/recraft-introduces-a-revolutionary-ai-model-that-thinks-in-design-language",
        },
        short_description:
          "Design-grade image model with strong text rendering and vector styles.",
        vendor: "recraft-ai",
        providers: {
          vercel: {
            provider: "vercel",
            id: "recraft/recraft-v3",
            pricing: {
              type: "per_image_flat",
              usd: 0.04,
            },
            avg_cost_usd: 0.04,
          },
          openrouter: {
            provider: "openrouter",
            id: "recraft/recraft-v3",
            pricing: {
              type: "per_image_flat",
              usd: 0.04,
            },
            avg_cost_usd: 0.04,
            url: "https://openrouter.ai/recraft/recraft-v3",
          },
          fal: {
            provider: "fal",
            id: "fal-ai/recraft/v3/text-to-image",
            pricing: {
              type: "per_image_flat",
              usd: 0.04,
            },
            avg_cost_usd: 0.04,
            url: "https://fal.ai/models/fal-ai/recraft/v3/text-to-image",
          },
        },
        speed_label: "medium",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: {
          max_edge: 2048,
        },
        pricing: {
          type: "per_image_flat",
          usd: 0.04,
        },
        avg_cost_usd: 0.04,
      },
    } /* generated:facts:image.models:end */ as const;

    /**
     * Resolve a model identifier to its cost card (data only).
     *
     * Accepts:
     * - Full provider model id (`"bfl/flux-pro-1.1"`)
     * - The deprecated `ProviderModel` wrapper
     * - Bare provider id (`"flux-pro-1.1"`) — exact match against the
     *   segment after the `vendor/` prefix. Unlike
     *   {@link text.modelSpecById}, there is no date-suffix tolerance:
     *   image providers don't snapshot ids the way text providers do.
     *
     * Returns `null` for unknown ids and empty input.
     */
    export function findImageModelCard(
      model: ProviderModel | ImageModelId
    ): ImageModelCard | null {
      if (!model) return null;
      const modelId = typeof model === "string" ? model : model.modelId;
      return cardByIdOver(models, modelId) ?? null;
    }

    /**
     * The binding for a specific provider, or `null` if that provider does
     * not serve this model. Mirrors {@link video.binding}.
     */
    export function binding(
      card: ImageModelCard,
      provider: ImageProvider
    ): ImageProviderBinding | null {
      return card.providers[provider] ?? null;
    }

    /**
     * Whether a bound provider declares native transparent-background support.
     * Missing bindings and unknown declarations return `false`; a binding's
     * explicit `false` or `null` masks the model declaration. This is catalogue
     * metadata, not a promise that a consumer's adapter can map the request.
     */
    export function supportsTransparentBackground(
      card: ImageModelCard,
      provider: ImageProvider
    ): boolean {
      const route = binding(card, provider);
      if (!route) return false;
      const support = route.transparent_background;
      return (
        (support === undefined ? card.transparent_background : support) === true
      );
    }
  }

  // ── models.audio ──────────────────────────────────────────────────

  /**
   * Audio-output generation catalogues.
   *
   * This namespace is organizational only. Music, sound effects, and
   * text-to-speech have separate model ids, provider contracts, request
   * shapes, lifecycle lists, and meters; there is deliberately no generic
   * audio-model union.
   */
  export namespace audio {
    /** Replicate-backed Google Lyria music generation. */
    export namespace music {
      export type ModelId = "google/lyria-3" | "google/lyria-3-pro";

      export type Input = {
        modalities: readonly ("text" | "image")[];
        max_images: number;
      };

      export type Duration =
        | { mode: "fixed"; seconds: number }
        | { mode: "up_to"; max_seconds: number };

      export type Output = {
        default_format: "mp3";
        formats: readonly "mp3"[];
        sample_rate_hz: number;
        channels: number;
        duration: Duration;
      };

      /** Replicate's flat charge per generated output file. */
      export type Pricing = {
        type: "per_run_flat";
        usd: number;
      };

      export type ModelCard = {
        id: ModelId;
        label: string;
        release: ModelRelease;
        short_description: string;
        vendor: "google";
        provider: "replicate";
        input: Input;
        output: Output;
        duration_label: string;
        output_format: "mp3";
        sample_rate_label: string;
        speed_label: image.SpeedLabel;
        speed_max: string;
        pricing: Pricing;
        /** Cost of one generation. Not for display. */
        avg_cost_usd: number;
        url: string;
      };

      export const models =
        /* generated:facts:audio.music.models:start */
        {
          "google/lyria-3": {
            id: "google/lyria-3",
            label: "Lyria 3",
            release: {
              date: "2026-02-18",
              basis: "model",
              source_url: "https://deepmind.google/models/model-cards/lyria-3/",
            },
            short_description:
              "Generate 30-second 48kHz stereo music clips from text or images.",
            vendor: "google",
            provider: "replicate",
            input: {
              modalities: ["text", "image"],
              max_images: 10,
            },
            output: {
              default_format: "mp3",
              formats: ["mp3"],
              sample_rate_hz: 48000,
              channels: 2,
              duration: {
                mode: "fixed",
                seconds: 30,
              },
            },
            duration_label: "30s",
            output_format: "mp3",
            sample_rate_label: "48 kHz stereo",
            speed_label: "fast",
            speed_max: "20s",
            pricing: {
              type: "per_run_flat",
              usd: 0.04,
            },
            avg_cost_usd: 0.04,
            url: "https://replicate.com/google/lyria-3",
          },
          "google/lyria-3-pro": {
            id: "google/lyria-3-pro",
            label: "Lyria 3 Pro",
            release: {
              date: "2026-03-25",
              basis: "model",
              source_url:
                "https://blog.google/innovation-and-ai/technology/developers-tools/lyria-3-developers/",
            },
            short_description:
              "Generate full-length tracks up to ~3 minutes from text or images.",
            vendor: "google",
            provider: "replicate",
            input: {
              modalities: ["text", "image"],
              max_images: 10,
            },
            output: {
              default_format: "mp3",
              formats: ["mp3"],
              sample_rate_hz: 48000,
              channels: 2,
              duration: {
                mode: "up_to",
                max_seconds: 180,
              },
            },
            duration_label: "up to 3m",
            output_format: "mp3",
            sample_rate_label: "48 kHz stereo",
            speed_label: "medium",
            speed_max: "60s",
            pricing: {
              type: "per_run_flat",
              usd: 0.08,
            },
            avg_cost_usd: 0.08,
            url: "https://replicate.com/google/lyria-3-pro",
          },
        } /* generated:facts:audio.music.models:end */ as const satisfies Record<
          ModelId,
          ModelCard
        >;

      export const model_ids = Object.freeze(Object.keys(models) as ModelId[]);

      export function is_model_id(id: string): id is ModelId {
        return (model_ids as readonly string[]).includes(id);
      }
    }

    /** ElevenLabs Text to Sound Effects. */
    export namespace sound_effects {
      /** Exact ElevenLabs Sound Effects API `model_id`. */
      export type ModelId = "eleven_text_to_sound_v2";

      export type Input = { type: "text" };

      export type Output = {
        default_format: "mp3";
        formats: readonly "mp3"[];
        sample_rate_hz: number;
        duration: {
          mode: "automatic_or_fixed";
          min_seconds: number;
          max_seconds: number;
        };
      };

      /**
       * ElevenLabs' API-native meter. Credits have no stable USD value because
       * their effective price varies by account plan.
       */
      export type Pricing = {
        type: "provider_credits";
        automatic_duration_credits: number;
        specified_duration_credits_per_second: number;
      };

      export type ModelCard = {
        id: ModelId;
        label: string;
        release: ModelRelease;
        short_description: string;
        vendor: "elevenlabs";
        provider: "elevenlabs";
        input: Input;
        output: Output;
        duration_label: string;
        output_format: "mp3";
        sample_rate_label: string;
        pricing: Pricing;
        /** Provider credits cannot be converted honestly without an account plan. */
        avg_cost_usd: null;
        url: string;
      };

      export const models =
        /* generated:facts:audio.sound_effects.models:start */
        {
          eleven_text_to_sound_v2: {
            id: "eleven_text_to_sound_v2",
            label: "Eleven Text to Sound v2",
            release: {
              date: "2025-09-02",
              basis: "model",
              source_url:
                "https://www.linkedin.com/posts/elevenlabsio_introducing-v2-of-our-sfx-model-generate-activity-7368680062662909953-aeBg",
            },
            short_description:
              "Generate loopable sound effects up to 30 seconds from text.",
            vendor: "elevenlabs",
            provider: "elevenlabs",
            input: {
              type: "text",
            },
            output: {
              default_format: "mp3",
              formats: ["mp3"],
              sample_rate_hz: 44100,
              duration: {
                mode: "automatic_or_fixed",
                min_seconds: 0.5,
                max_seconds: 30,
              },
            },
            duration_label: "0.5–30s",
            output_format: "mp3",
            sample_rate_label: "44.1 kHz",
            pricing: {
              type: "provider_credits",
              automatic_duration_credits: 100,
              specified_duration_credits_per_second: 11,
            },
            avg_cost_usd: null,
            url: "https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert",
          },
        } /* generated:facts:audio.sound_effects.models:end */ as const satisfies Record<
          ModelId,
          ModelCard
        >;

      export const model_ids = Object.freeze(Object.keys(models) as ModelId[]);
    }

    /** ElevenLabs expressive text-to-speech generation. */
    export namespace text_to_speech {
      /** Exact ElevenLabs Text to Speech API `model_id`. */
      export type ModelId = "eleven_v3";

      export type Input = {
        type: "text";
        max_characters: number;
        /** Whether bracketed audio and emotion tags are accepted in text. */
        audio_tags: boolean;
      };

      export type Output = {
        default_format: "mp3";
        formats: readonly "mp3"[];
        sample_rate_hz: number;
        bit_rate_kbps: number;
      };

      /** ElevenLabs' published API rate for Text to Speech v3. */
      export type Pricing = {
        type: "per_1000_characters";
        usd: number;
      };

      export type ModelCard = {
        id: ModelId;
        label: string;
        release: ModelRelease;
        short_description: string;
        vendor: "elevenlabs";
        provider: "elevenlabs";
        input: Input;
        output: Output;
        output_format: "mp3";
        sample_rate_label: string;
        pricing: Pricing;
        url: string;
      };

      export const models =
        /* generated:facts:audio.text_to_speech.models:start */
        {
          eleven_v3: {
            id: "eleven_v3",
            label: "Eleven v3",
            release: {
              date: "2025-06-03",
              basis: "model",
              source_url: "https://elevenlabs.io/blog/eleven-v3",
            },
            short_description:
              "Generate expressive speech with bracketed audio and emotion tags.",
            vendor: "elevenlabs",
            provider: "elevenlabs",
            input: {
              type: "text",
              max_characters: 5000,
              audio_tags: true,
            },
            output: {
              default_format: "mp3",
              formats: ["mp3"],
              sample_rate_hz: 44100,
              bit_rate_kbps: 128,
            },
            output_format: "mp3",
            sample_rate_label: "44.1 kHz · 128 kbps",
            pricing: {
              type: "per_1000_characters",
              usd: 0.1,
            },
            url: "https://elevenlabs.io/docs/api-reference/text-to-speech/convert",
          },
        } /* generated:facts:audio.text_to_speech.models:end */ as const satisfies Record<
          ModelId,
          ModelCard
        >;

      export const model_ids = Object.freeze(Object.keys(models) as ModelId[]);
    }
  }

  // ── models.three_d ────────────────────────────────────────────────

  /**
   * 3D-generation endpoint catalogue.
   *
   * Exact ids, IO contracts, and provider meters. Application integration and
   * lifecycle are independent of these facts. Legacy endpoints are served by fal.
   * Direct feature-based models
   * live under model_generation and keep input variants out of model identity.
   */
  export namespace three_d {
    /** Rig eligibility is an operation, not a model identity. */
    export namespace rig_check {
      export const operation =
        /* generated:facts:three_d.rig_check.operation:start */
        {
          feature: "rig-check",
          provider: "tripo",
          binding_id: "rig-check",
          input: {
            formats: ["glb"],
            max_bytes: 150000000,
          },
          rig_types: [
            "biped",
            "quadruped",
            "hexapod",
            "octopod",
            "avian",
            "serpentine",
            "aquatic",
          ],
          pricing: {
            type: "per_operation_credits",
            credits: 0,
            usd_per_credit: 0.01,
            source_url: "https://developers.tripo3d.ai/en/pricing",
          },
          url: "https://developers.tripo3d.ai/en/docs/animations-rig-check",
        } /* generated:facts:three_d.rig_check.operation:end */ as const;
    }

    /** Actual rigging model versions, independent of model generation. */
    export namespace rigging {
      export type ModelId = "tripo/rig-v1.0" | "tripo/rig-v2.5";
      export type RigType = (typeof rig_check.operation.rig_types)[number];
      export type Spec = "tripo" | "mixamo";
      export type ModelCard = {
        id: ModelId;
        label: string;
        vendor: "tripo";
        provider: "tripo";
        feature: "rigging";
        binding_id: "v1.0-20240301" | "v2.5-20260210";
        release: ModelRelease;
        short_description: string;
        rig_types: readonly RigType[];
        specs: readonly Spec[];
        input: { formats: readonly string[]; max_bytes: number };
        output: { formats: readonly ["glb", "fbx"] };
        pricing: {
          type: "per_operation_credits";
          credits: number;
          usd_per_credit: number;
          source_url: string;
        };
        url: string;
      };
      // The pricing table is authoritative over the stale 30-credit response example.
      // Snapshot suffixes are not evidence of the first public release day.
      export const models =
        /* generated:facts:three_d.rigging.models:start */
        {
          "tripo/rig-v1.0": {
            vendor: "tripo",
            provider: "tripo",
            feature: "rigging",
            specs: ["tripo", "mixamo"],
            input: {
              formats: ["glb", "gltf", "fbx", "obj", "stl"],
              max_bytes: 150000000,
            },
            output: {
              formats: ["glb", "fbx"],
            },
            pricing: {
              type: "per_operation_credits",
              credits: 25,
              usd_per_credit: 0.01,
              source_url: "https://developers.tripo3d.ai/en/pricing",
            },
            release: {
              date: null,
              basis: "provider_endpoint",
              source_url:
                "https://developers.tripo3d.ai/en/docs/animations-rig",
            },
            url: "https://developers.tripo3d.ai/en/docs/animations-rig",
            id: "tripo/rig-v1.0",
            label: "Tripo Rig v1.0",
            binding_id: "v1.0-20240301",
            short_description:
              "Automatic skeleton rigging for humanoid characters.",
            rig_types: ["biped"],
          },
          "tripo/rig-v2.5": {
            vendor: "tripo",
            provider: "tripo",
            feature: "rigging",
            specs: ["tripo", "mixamo"],
            input: {
              formats: ["glb", "gltf", "fbx", "obj", "stl"],
              max_bytes: 150000000,
            },
            output: {
              formats: ["glb", "fbx"],
            },
            pricing: {
              type: "per_operation_credits",
              credits: 25,
              usd_per_credit: 0.01,
              source_url: "https://developers.tripo3d.ai/en/pricing",
            },
            release: {
              date: null,
              basis: "provider_endpoint",
              source_url:
                "https://developers.tripo3d.ai/en/docs/animations-rig",
            },
            url: "https://developers.tripo3d.ai/en/docs/animations-rig",
            id: "tripo/rig-v2.5",
            label: "Tripo Rig v2.5",
            binding_id: "v2.5-20260210",
            short_description:
              "Automatic skeleton rigging for animals and other creatures.",
            rig_types: [
              "quadruped",
              "hexapod",
              "octopod",
              "avian",
              "serpentine",
              "aquatic",
            ],
          },
        } /* generated:facts:three_d.rigging.models:end */ as const satisfies Record<
          ModelId,
          ModelCard
        >;
      export const model_ids = Object.freeze(Object.keys(models) as ModelId[]);
      export function is_model_id(value: string): value is ModelId {
        return (model_ids as readonly string[]).includes(value);
      }
    }

    /** Model generation is a feature; its text/image/multiview inputs are variants. */
    export namespace model_generation {
      export type ModelId = "tripo/h3.1" | "tripo/p1" | "tripo/p2";
      export type InputVariant = "text" | "image" | "multiview";
      export type TextureQuality = "standard" | "detailed" | "extreme";
      export type GeometryQuality = "standard" | "detailed";
      export type ModelCard = {
        id: ModelId;
        label: string;
        vendor: "tripo";
        provider: "tripo";
        feature: "model-generation";
        binding_id: "v3.1-20260211" | "P1-20260311" | "P2-20260801";
        preview: boolean;
        release: ModelRelease;
        short_description: string;
        inputs: readonly InputVariant[];
        output: { primary: "glb"; compression: "none" };
        face_limit: { min: number; max: number; detailed_max?: number };
        texture_quality: readonly TextureQuality[];
        geometry_quality?: readonly GeometryQuality[];
        pricing: {
          type: "per_generation_credits";
          usd_per_credit: number;
          base_credits: Record<InputVariant, number>;
          texture_credits: Record<TextureQuality, number>;
          detailed_geometry_credits?: number;
          source_url: string;
        };
        url: string;
      };
      export const models =
        /* generated:facts:three_d.model_generation.models:start */
        {
          "tripo/h3.1": {
            vendor: "tripo",
            provider: "tripo",
            feature: "model-generation",
            inputs: ["text", "image", "multiview"],
            output: {
              primary: "glb",
              compression: "none",
            },
            texture_quality: ["standard", "detailed", "extreme"],
            id: "tripo/h3.1",
            label: "Tripo H3.1",
            binding_id: "v3.1-20260211",
            preview: false,
            release: {
              date: "2026-03-06",
              basis: "model",
              source_url:
                "https://www.tripo3d.ai/blog/introducing-hd-model-v3-1",
            },
            short_description:
              "High-detail geometry with optional PBR textures.",
            face_limit: {
              min: 1,
              max: 1500000,
              detailed_max: 2000000,
            },
            geometry_quality: ["standard", "detailed"],
            pricing: {
              type: "per_generation_credits",
              usd_per_credit: 0.01,
              texture_credits: {
                standard: 10,
                detailed: 20,
                extreme: 30,
              },
              source_url: "https://developers.tripo3d.ai/en/pricing",
              base_credits: {
                text: 10,
                image: 20,
                multiview: 20,
              },
              detailed_geometry_credits: 20,
            },
            url: "https://developers.tripo3d.ai/en/docs/generation-text-to-model/standard",
          },
          "tripo/p1": {
            vendor: "tripo",
            provider: "tripo",
            feature: "model-generation",
            inputs: ["text", "image", "multiview"],
            output: {
              primary: "glb",
              compression: "none",
            },
            texture_quality: ["standard", "detailed", "extreme"],
            id: "tripo/p1",
            label: "Tripo P1",
            binding_id: "P1-20260311",
            preview: false,
            release: {
              date: "2026-03-11",
              basis: "model",
              source_url:
                "https://www.tripo3d.ai/blog/introducing-smart-mesh-v1",
            },
            short_description: "Low-poly generation with clean mesh topology.",
            face_limit: {
              min: 50,
              max: 20000,
            },
            pricing: {
              type: "per_generation_credits",
              usd_per_credit: 0.01,
              texture_credits: {
                standard: 10,
                detailed: 20,
                extreme: 30,
              },
              source_url: "https://developers.tripo3d.ai/en/pricing",
              base_credits: {
                text: 30,
                image: 40,
                multiview: 40,
              },
            },
            url: "https://developers.tripo3d.ai/en/docs/generation-text-to-model/p",
          },
          "tripo/p2": {
            vendor: "tripo",
            provider: "tripo",
            feature: "model-generation",
            inputs: ["text", "image", "multiview"],
            output: {
              primary: "glb",
              compression: "none",
            },
            texture_quality: ["standard", "detailed", "extreme"],
            id: "tripo/p2",
            label: "Tripo P2 Preview",
            binding_id: "P2-20260801",
            preview: true,
            release: {
              date: "2026-08-19",
              basis: "model",
              source_url: "https://www.tripo3d.ai/blog/tripo-p2-0-preview",
            },
            short_description:
              "Preview of next-generation low-poly mesh generation.",
            face_limit: {
              min: 48,
              max: 50000,
            },
            pricing: {
              type: "per_generation_credits",
              usd_per_credit: 0.01,
              texture_credits: {
                standard: 10,
                detailed: 20,
                extreme: 30,
              },
              source_url: "https://developers.tripo3d.ai/en/pricing",
              base_credits: {
                text: 100,
                image: 100,
                multiview: 100,
              },
            },
            url: "https://developers.tripo3d.ai/en/docs/generation-text-to-model/p",
          },
        } /* generated:facts:three_d.model_generation.models:end */ as const satisfies Record<
          ModelId,
          ModelCard
        >;
      export const model_ids = Object.freeze(Object.keys(models) as ModelId[]);
      export function is_model_id(value: string): value is ModelId {
        return (model_ids as readonly string[]).includes(value);
      }
    }

    export type TextToThreeDModelId = "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d";

    export type ImageToThreeDModelId =
      | "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d"
      | "fal-ai/trellis-2";

    export type ThreeDModelId = TextToThreeDModelId | ImageToThreeDModelId;

    export type ThreeDModelCategory = "3d/text-to-3d" | "3d/image-to-3d";

    export type ThreeDInput =
      | {
          type: "text";
          /** Provider-published UTF-8 prompt ceiling. */
          max_utf8_characters: number;
        }
      | {
          type: "image";
          min_images: number;
          /** One required front image plus any provider-supported extra views. */
          max_images: number;
        };

    export type ThreeDOutputFormat = "glb" | "fbx" | "obj" | "usdz";

    export type ThreeDOutput = {
      /** Required, portable result returned by every catalogued endpoint. */
      primary: "glb";
      /** Provider-schema formats that may also be present in `model_urls`. */
      optional: readonly Exclude<ThreeDOutputFormat, "glb">[];
    };

    export type HunyuanSurcharge = "pbr" | "multi_view" | "custom_face_count";

    export type PerGenerationBasePlusSurchargesPricing = {
      type: "per_generation_base_plus_surcharges";
      /** Starting price for the default generation request. */
      base_usd: number;
      /** Additive provider charges when the corresponding option is used. */
      surcharges_usd: Partial<Record<HunyuanSurcharge, number>>;
    };

    export type TrellisResolution = "512" | "1024" | "1536";

    export type PerGenerationByResolutionPricing = {
      type: "per_generation_by_resolution";
      default_resolution: TrellisResolution;
      usd_by_resolution: Record<TrellisResolution, number>;
    };

    export type ThreeDModelPricing =
      | PerGenerationBasePlusSurchargesPricing
      | PerGenerationByResolutionPricing;

    export type ThreeDModelCard = {
      /** Exact fal endpoint id; unlike video, there is no canonical indirection. */
      id: ThreeDModelId;
      label: string;
      release: ModelRelease;
      short_description: string;
      vendor: Vendor;
      /** Every currently catalogued endpoint is the exact fal route in `id`. */
      provider: "fal";
      category: ThreeDModelCategory;
      input: ThreeDInput;
      output: ThreeDOutput;
      pricing: ThreeDModelPricing;
      /** Cost of the default request represented by the card. Not for display. */
      avg_cost_usd: number;
      /** Public fal model page for this exact endpoint. */
      url: string;
    };

    export const models =
      /* generated:facts:three_d.models:start */
      {
        "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d": {
          id: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
          label: "Hunyuan 3D v3.1 Pro — Text",
          release: {
            date: "2026-01-16",
            basis: "model",
            source_url:
              "https://cloud.tencent.com/document/product/1804/120694",
          },
          short_description: "Generate a textured 3D asset from a text prompt.",
          vendor: "tencent",
          provider: "fal",
          category: "3d/text-to-3d",
          input: {
            type: "text",
            max_utf8_characters: 1024,
          },
          output: {
            primary: "glb",
            optional: ["fbx", "obj", "usdz"],
          },
          pricing: {
            type: "per_generation_base_plus_surcharges",
            base_usd: 0.375,
            surcharges_usd: {
              pbr: 0.15,
              custom_face_count: 0.15,
            },
          },
          avg_cost_usd: 0.375,
          url: "https://fal.ai/models/fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
        },
        "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d": {
          id: "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
          label: "Hunyuan 3D v3.1 Pro — Image",
          release: {
            date: "2026-01-16",
            basis: "model",
            source_url:
              "https://cloud.tencent.com/document/product/1804/120694",
          },
          short_description:
            "Generate a textured 3D asset from one image or up to eight views.",
          vendor: "tencent",
          provider: "fal",
          category: "3d/image-to-3d",
          input: {
            type: "image",
            min_images: 1,
            max_images: 8,
          },
          output: {
            primary: "glb",
            optional: ["fbx", "obj", "usdz"],
          },
          pricing: {
            type: "per_generation_base_plus_surcharges",
            base_usd: 0.375,
            surcharges_usd: {
              pbr: 0.15,
              multi_view: 0.15,
              custom_face_count: 0.15,
            },
          },
          avg_cost_usd: 0.375,
          url: "https://fal.ai/models/fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
        },
        "fal-ai/trellis-2": {
          id: "fal-ai/trellis-2",
          label: "TRELLIS.2",
          release: {
            date: "2025-12-16",
            basis: "model",
            source_url: "https://huggingface.co/microsoft/TRELLIS.2-4B",
          },
          short_description:
            "Generate a textured GLB asset from a single reference image.",
          vendor: "microsoft",
          provider: "fal",
          category: "3d/image-to-3d",
          input: {
            type: "image",
            min_images: 1,
            max_images: 1,
          },
          output: {
            primary: "glb",
            optional: [],
          },
          pricing: {
            type: "per_generation_by_resolution",
            default_resolution: "1024",
            usd_by_resolution: {
              "512": 0.25,
              "1024": 0.3,
              "1536": 0.35,
            },
          },
          avg_cost_usd: 0.3,
          url: "https://fal.ai/models/fal-ai/trellis-2",
        },
      } /* generated:facts:three_d.models:end */ as const satisfies Record<
        ThreeDModelId,
        ThreeDModelCard
      >;

    export const three_d_model_ids = Object.freeze(
      Object.keys(models) as ThreeDModelId[]
    );
    export const text_to_three_d_model_ids = Object.freeze(
      three_d_model_ids.filter(
        (id): id is TextToThreeDModelId => models[id].input.type === "text"
      )
    );
    export const image_to_three_d_model_ids = Object.freeze(
      three_d_model_ids.filter(
        (id): id is ImageToThreeDModelId => models[id].input.type === "image"
      )
    );

    export function is_text_to_three_d_model_id(
      id: string
    ): id is TextToThreeDModelId {
      return (text_to_three_d_model_ids as readonly string[]).includes(id);
    }

    export function is_image_to_three_d_model_id(
      id: string
    ): id is ImageToThreeDModelId {
      return (image_to_three_d_model_ids as readonly string[]).includes(id);
    }
  }

  // ── models.video ──────────────────────────────────────────────────

  /**
   * Video-generation model catalogue.
   *
   * The video provider ecosystem is **fragmented**: the same model is served
   * by several providers (Vercel AI Gateway, fal.ai, OpenRouter), each with a
   * *different id, a different meter, and different availability*. So unlike
   * `models.image`/`models.audio.music`/`models.audio.sound_effects`/
   * `models.audio.text_to_speech` — which bind one card to one provider — a
   * video card is **canonical** (provider-agnostic id + intrinsic specs) and
   * holds a {@link VideoProviderBinding} per provider that serves it, keyed by
   * provider in {@link VideoModelCard.providers}. The default-provider choice
   * is **deliberately not encoded here** — bindings carry no preference order;
   * selection is a runtime concern. Look up a route with {@link binding}.
   *
   * Each binding records whether its route accepts text alone, requires a
   * starting image, or supports both. These are provider-documented facts;
   * neither the canonical model name nor the endpoint id implies them.
   * Editing, reference-to-video, and other inputs are outside this contract.
   *
   * **Pricing.** Video bills by output **duration**, and the rate varies by
   * both resolution and whether audio is generated, so `per_second` is keyed
   * `resolution → audio-mode → USD/s` (see {@link PerSecondPricing}). A
   * provider-published input-image surcharge stays explicit beside that
   * duration meter. Values are real provider rates; update them if a provider
   * changes its meter.
   *
   * **Catalogue boundary.** A model belongs here only when Grida supports at
   * least one concrete provider route with grounded pricing and enables the
   * model in runtime selection. Published, announced, or compatibility-only
   * models stay out of the catalogue.
   */
  export namespace video {
    /**
     * Every provider that can serve a video model, as a value. The runtime
     * list is the SOURCE; {@link VideoProvider} is derived from it. Kept
     * separate from {@link image.providers} even though the members
     * currently coincide — they are independent sets that happen to agree.
     */
    export const providers = ["vercel", "fal", "openrouter"] as const;

    /**
     * A provider that can serve a video model. Distinct from the top-level
     * {@link models.Provider} because video routes through more than the
     * Vercel AI Gateway. Each provider uses its own id format and meter.
     */
    export type VideoProvider = (typeof providers)[number];

    /**
     * **Canonical**, provider-agnostic model id in `vendor/model` form
     * (e.g. `google/veo-3.1`). This is *our* key, not any one provider's id —
     * the provider-specific call id lives on each {@link VideoProviderBinding}.
     * Open union (`string & {}`) keeps unrecognized ids assignable.
     */
    export type VideoModelId =
      | "google/veo-3.1"
      | "google/veo-3.1-fast"
      | "google/veo-3.1-lite"
      | "alibaba/wan-3.0"
      | "bytedance/seedance-2.5"
      | "bytedance/seedance-2.0"
      | "xai/grok-imagine-video-1.5"
      | (string & {});

    /** Resolution label (e.g. `"720p"`, `"1080p"`, `"4k"`). Pricing-map + UI key. */
    export type ResolutionLabel = string;

    /**
     * Whether a clip is generated with synchronized audio. A real pricing axis:
     * both fal and the Vercel AI Gateway meter `silent` at roughly half of
     * `audio`; Seedance bundles audio into its single rate.
     */
    export type AudioMode = "audio" | "silent";

    // ── Pricing ─────────────────────────────────────────────────────

    /**
     * Per-second pricing, nested `resolution → audio-mode → USD/s`. Lives on a
     * {@link VideoProviderBinding} — meters differ across providers.
     *
     * A binding lists only the `(resolution, mode)` combinations its provider
     * actually serves and meters, so the keys double as that provider's
     * resolution/audio support: Seedance lists only `audio` because it bundles
     * audio into one rate, and Veo 3.1 Lite omits `"4k"` because Vercel AI Gateway
     * does not sell it at that line. Each value is the real
     * USD-per-output-second rate for that exact config.
     *
     * These keys are provider truth, not Grida's request surface — a
     * `(resolution, mode)` pair may be catalogued before the hosted wire can
     * ask for it.
     */
    export type PerSecondPricing = {
      type: "per_second";
      /** USD/s, by resolution then audio mode. */
      usd_per_second: Record<
        ResolutionLabel,
        Partial<Record<AudioMode, number>>
      >;
      /** Additional provider charge for each input image, when applicable. */
      usd_per_input_image?: number;
    };

    export type VideoModelPricing = PerSecondPricing;

    /**
     * Input modes for one concrete route. `text` does not accept a starting
     * image; `image` requires one; `text-or-image` accepts either. An image
     * mode may also accept or require a text prompt. This does not describe
     * arbitrary references, ending frames, edits, or video/audio inputs.
     */
    export type VideoInput = "text" | "image" | "text-or-image";

    /**
     * How one provider serves a canonical model: the id you actually call on
     * that provider, plus that provider's own meter. The unit of
     * provider-selection. Keyed by {@link VideoProvider} in
     * {@link VideoModelCard.providers}, so `provider` here must equal that key.
     */
    export type VideoProviderBinding = {
      provider: VideoProvider;
      /**
       * Provider-specific call id. Format varies —
       * `google/veo-3.1-generate-001` (Vercel AI Gateway), `fal-ai/veo3.1/image-to-video`
       * (fal, where the capability is keyed into the endpoint id).
       */
      id: string;
      /**
       * Verified input modes of this route. Absent only for older snapshots;
       * `null` explicitly means unknown and disables input-mode resolution.
       * Use {@link input} for the exact-binding legacy fallback.
       */
      input?: VideoInput | null;
      /** Real upstream pricing for **this** provider — meters differ across providers. */
      pricing: VideoModelPricing;
      /**
       * Coarse provider cost per invocation in USD — this binding's rate at the
       * model's default `(resolution, audio)` × default duration, plus any
       * required input-image surcharge. For budget estimation; not for display.
       */
      avg_cost_usd: number;
      /** Per-binding deprecation (a provider may retire a route independently). */
      deprecated?: boolean;
      /** Provider's page for this binding; UI falls back to {@link VideoModelCard.url}. */
      url?: string;
    };

    export type VideoModelCard = {
      /** Canonical, provider-agnostic id. */
      id: VideoModelId;
      label: string;
      /** Optional only for backwards-compatible snapshot parsing. */
      release?: ModelRelease;
      short_description: string;
      vendor: Vendor;
      /** Supported aspect ratios. */
      aspect_ratios: image.AspectRatioString[];
      /** Inclusive output-duration bounds, in seconds. */
      min_duration: number;
      max_duration: number;
      /** Whether the model can produce synchronized audio (capability; per-mode pricing lives on each binding). */
      audio: boolean;
      speed_label: image.SpeedLabel;
      /** Original vendor's model card page (not a serving gateway). */
      url: string;
      /**
       * Providers that serve this model, keyed by provider. **No implied
       * preference** — default-provider selection is deferred to the runtime.
       * Non-empty; keying makes providers unique by construction.
       */
      providers: Partial<Record<VideoProvider, VideoProviderBinding>>;
    };

    type CatalogCard = VideoModelCard & {
      release: ModelRelease;
      providers: Partial<
        Record<VideoProvider, VideoProviderBinding & { input: VideoInput }>
      >;
    };

    export const models: Partial<
      Record<VideoModelId, CatalogCard>
    > /* generated:facts:video.models:start */ = {
      "google/veo-3.1": {
        id: "google/veo-3.1",
        label: "Veo 3.1",
        release: {
          date: "2025-10-15",
          basis: "model",
          source_url: "https://ai.google.dev/gemini-api/docs/changelog",
        },
        short_description:
          "Google's flagship video model — strong prompt adherence with native, synchronized audio.",
        vendor: "google",
        aspect_ratios: ["16:9", "9:16"],
        min_duration: 4,
        max_duration: 8,
        audio: true,
        speed_label: "slow",
        url: "https://deepmind.google/models/veo/",
        providers: {
          vercel: {
            provider: "vercel",
            id: "google/veo-3.1-generate-001",
            input: "text-or-image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "720p": {
                  audio: 0.4,
                  silent: 0.2,
                },
                "1080p": {
                  audio: 0.4,
                  silent: 0.2,
                },
                "4k": {
                  audio: 0.6,
                  silent: 0.4,
                },
              },
            },
            avg_cost_usd: 3.2,
            url: "https://vercel.com/ai-gateway/models/veo-3.1-generate-001",
          },
          fal: {
            provider: "fal",
            id: "fal-ai/veo3.1/image-to-video",
            input: "image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "720p": {
                  audio: 0.4,
                  silent: 0.2,
                },
                "1080p": {
                  audio: 0.4,
                  silent: 0.2,
                },
                "4k": {
                  audio: 0.6,
                  silent: 0.4,
                },
              },
            },
            avg_cost_usd: 3.2,
            url: "https://fal.ai/models/fal-ai/veo3.1/image-to-video",
          },
          openrouter: {
            provider: "openrouter",
            id: "google/veo-3.1",
            input: "text-or-image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "720p": {
                  audio: 0.4,
                },
                "1080p": {
                  audio: 0.4,
                },
              },
            },
            avg_cost_usd: 3.2,
            url: "https://openrouter.ai/google/veo-3.1",
          },
        },
      },
      "google/veo-3.1-fast": {
        id: "google/veo-3.1-fast",
        label: "Veo 3.1 Fast",
        release: {
          date: "2025-10-15",
          basis: "model",
          source_url: "https://ai.google.dev/gemini-api/docs/changelog",
        },
        short_description:
          "Faster, cheaper Veo 3.1 — the same envelope and native audio at a fraction of the price.",
        vendor: "google",
        aspect_ratios: ["16:9", "9:16"],
        min_duration: 4,
        max_duration: 8,
        audio: true,
        speed_label: "medium",
        url: "https://deepmind.google/models/veo/",
        providers: {
          vercel: {
            provider: "vercel",
            id: "google/veo-3.1-fast-generate-001",
            input: "text-or-image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "720p": {
                  audio: 0.15,
                  silent: 0.1,
                },
                "1080p": {
                  audio: 0.15,
                  silent: 0.1,
                },
                "4k": {
                  audio: 0.35,
                  silent: 0.3,
                },
              },
            },
            avg_cost_usd: 1.2,
            url: "https://vercel.com/ai-gateway/models/veo-3.1-fast-generate-001",
          },
          fal: {
            provider: "fal",
            id: "fal-ai/veo3.1/fast/image-to-video",
            input: "image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "720p": {
                  audio: 0.15,
                  silent: 0.1,
                },
                "1080p": {
                  audio: 0.15,
                  silent: 0.1,
                },
                "4k": {
                  audio: 0.35,
                  silent: 0.3,
                },
              },
            },
            avg_cost_usd: 1.2,
            url: "https://fal.ai/models/fal-ai/veo3.1/fast/image-to-video",
          },
        },
      },
      "google/veo-3.1-lite": {
        id: "google/veo-3.1-lite",
        label: "Veo 3.1 Lite",
        release: {
          date: "2026-03-31",
          basis: "model",
          source_url:
            "https://blog.google/innovation-and-ai/technology/ai/veo-3-1-lite/",
        },
        short_description:
          "Budget Veo 3.1 — 720p/1080p clips with native audio for a few cents a second.",
        vendor: "google",
        aspect_ratios: ["16:9", "9:16"],
        min_duration: 4,
        max_duration: 8,
        audio: true,
        speed_label: "fast",
        url: "https://deepmind.google/models/veo/",
        providers: {
          vercel: {
            provider: "vercel",
            id: "google/veo-3.1-lite-generate-001",
            input: "text-or-image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "720p": {
                  audio: 0.05,
                  silent: 0.03,
                },
                "1080p": {
                  audio: 0.08,
                  silent: 0.05,
                },
              },
            },
            avg_cost_usd: 0.64,
            url: "https://vercel.com/ai-gateway/models/veo-3.1-lite-generate-001",
          },
          fal: {
            provider: "fal",
            id: "fal-ai/veo3.1/lite/image-to-video",
            input: "image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "720p": {
                  audio: 0.05,
                  silent: 0.03,
                },
                "1080p": {
                  audio: 0.08,
                  silent: 0.05,
                },
              },
            },
            avg_cost_usd: 0.64,
            url: "https://fal.ai/models/fal-ai/veo3.1/lite/image-to-video",
          },
        },
      },
      "alibaba/wan-3.0": {
        id: "alibaba/wan-3.0",
        label: "Wan 3.0",
        release: {
          date: "2026-08-06",
          basis: "model",
          source_url:
            "https://www.alibabacloud.com/help/en/model-studio/newly-released-models",
        },
        short_description:
          "Alibaba's flagship video model — long clips (up to 30s) with bundled audio at the lowest per-second rates in the catalogue.",
        vendor: "alibaba",
        aspect_ratios: ["16:9", "4:3", "1:1", "3:4", "9:16"],
        min_duration: 2,
        max_duration: 30,
        audio: true,
        speed_label: "medium",
        url: "https://wan.video/",
        providers: {
          vercel: {
            provider: "vercel",
            id: "alibaba/wan-v3.0-video",
            input: "text-or-image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "480p": {
                  audio: 0.05,
                },
                "720p": {
                  audio: 0.1,
                },
                "1080p": {
                  audio: 0.2,
                },
              },
            },
            avg_cost_usd: 1,
            url: "https://vercel.com/ai-gateway/models/wan-v3.0-video",
          },
          fal: {
            provider: "fal",
            id: "alibaba/wan-3.0/image-to-video",
            input: "image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "480p": {
                  audio: 0.05,
                },
                "720p": {
                  audio: 0.1,
                },
                "1080p": {
                  audio: 0.2,
                },
              },
            },
            avg_cost_usd: 1,
            url: "https://fal.ai/models/alibaba/wan-3.0/image-to-video",
          },
        },
      },
      "bytedance/seedance-2.0": {
        id: "bytedance/seedance-2.0",
        label: "Seedance 2.0",
        release: {
          date: "2026-02-12",
          basis: "model",
          source_url:
            "https://seed.bytedance.com/en/blog/seedance-2-0-%E6%AD%A3%E5%BC%8F%E5%8F%91%E5%B8%83",
        },
        short_description:
          "ByteDance's video model — image-to-video with reference modes, up to 4K, at roughly two-thirds the price of Seedance 2.5.",
        vendor: "bytedance",
        aspect_ratios: ["16:9", "9:16", "1:1"],
        min_duration: 5,
        max_duration: 15,
        audio: true,
        speed_label: "slow",
        url: "https://seed.bytedance.com/en/seedance2_0",
        providers: {
          fal: {
            provider: "fal",
            id: "bytedance/seedance-2.0/image-to-video",
            input: "image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "720p": {
                  audio: 0.3034,
                },
                "1080p": {
                  audio: 0.682,
                },
              },
            },
            avg_cost_usd: 1.52,
            url: "https://fal.ai/models/bytedance/seedance-2.0/image-to-video",
          },
          openrouter: {
            provider: "openrouter",
            id: "bytedance/seedance-2.0",
            input: "text-or-image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "480p": {
                  audio: 0.06726,
                },
                "720p": {
                  audio: 0.06726,
                },
              },
            },
            avg_cost_usd: 0.34,
            url: "https://openrouter.ai/bytedance/seedance-2.0",
          },
        },
      },
      "bytedance/seedance-2.5": {
        id: "bytedance/seedance-2.5",
        label: "Seedance 2.5",
        release: {
          date: "2026-07-31",
          basis: "model",
          source_url:
            "https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5",
        },
        short_description:
          "ByteDance's latest video model — up to 30-second clips with native audio, reference and editing modes.",
        vendor: "bytedance",
        aspect_ratios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
        min_duration: 4,
        max_duration: 30,
        audio: true,
        speed_label: "slow",
        url: "https://seed.bytedance.com/en/seedance",
        providers: {
          fal: {
            provider: "fal",
            id: "bytedance/seedance-2.5/image-to-video",
            input: "image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "480p": {
                  audio: 0.2205,
                },
                "720p": {
                  audio: 0.473,
                },
                "1080p": {
                  audio: 1.164,
                },
              },
            },
            avg_cost_usd: 2.37,
            url: "https://fal.ai/models/bytedance/seedance-2.5/image-to-video",
          },
        },
      },
      "xai/grok-imagine-video-1.5": {
        id: "xai/grok-imagine-video-1.5",
        label: "Grok Imagine Video 1.5",
        release: {
          date: "2026-06-03",
          basis: "model",
          source_url: "https://x.ai/news/grok-imagine-1-5",
        },
        short_description:
          "SpaceXAI's image-to-video model — animates a still into cinematic video with native, lip-synced audio.",
        vendor: "xai",
        aspect_ratios: ["16:9", "9:16"],
        min_duration: 1,
        max_duration: 15,
        audio: true,
        speed_label: "fast",
        url: "https://docs.x.ai/developers/models/grok-imagine-video-1.5",
        providers: {
          vercel: {
            provider: "vercel",
            id: "spacexai/grok-imagine-video-1.5",
            input: "image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "480p": {
                  audio: 0.08,
                },
                "720p": {
                  audio: 0.14,
                },
                "1080p": {
                  audio: 0.25,
                },
              },
              usd_per_input_image: 0.01,
            },
            avg_cost_usd: 0.71,
            url: "https://vercel.com/ai-gateway/models/grok-imagine-video-1.5",
          },
          fal: {
            provider: "fal",
            id: "xai/grok-imagine-video/v1.5/image-to-video",
            input: "image",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "480p": {
                  audio: 0.08,
                },
                "720p": {
                  audio: 0.14,
                },
                "1080p": {
                  audio: 0.25,
                },
              },
              usd_per_input_image: 0.01,
            },
            avg_cost_usd: 0.71,
            url: "https://fal.ai/models/xai/grok-imagine-video/v1.5/image-to-video",
          },
        },
      },
    } /* generated:facts:video.models:end */ as const;

    export const video_model_ids = Object.keys(models) as VideoModelId[];

    /**
     * The binding for a specific provider, or `null` if that provider does
     * not serve this model.
     */
    export function binding(
      card: VideoModelCard,
      provider: VideoProvider
    ): VideoProviderBinding | null {
      return card.providers[provider] ?? null;
    }

    /**
     * Effective input fact for a binding on the caller's current card.
     *
     * Older snapshots omit `input`. Only an exact canonical id, provider,
     * and binding id match may borrow the bundled fact. A removed binding
     * is never restored; a replacement without a fact remains unknown.
     * Explicit `null` or an unrecognized value never triggers fallback.
     * Availability and deprecation checks remain the consumer's concern.
     */
    export function input(
      card: VideoModelCard,
      provider: VideoProvider
    ): VideoInput | null {
      const current = binding(card, provider);
      if (!current || current.provider !== provider) return null;
      if (Object.prototype.hasOwnProperty.call(current, "input")) {
        switch (current.input) {
          case "text":
          case "image":
          case "text-or-image":
            return current.input;
          default:
            return null;
        }
      }
      if (!Object.prototype.hasOwnProperty.call(models, card.id)) return null;
      const bundled = models[card.id]?.providers[provider];
      return bundled?.id === current.id ? bundled.input : null;
    }
  }

  // ── models.image_tools ────────────────────────────────────────────

  /**
   * Image-tool model catalogue — non-generator image models
   * (background removal, upscaling, etc.) routed through Replicate.
   * Separate from `models.image` because the schema is simpler (flat
   * per-invocation cost) and these models surface as canvas tools,
   * not as full image generators.
   */
  export namespace image_tools {
    export type ImageToolModelId =
      | "recraft-ai/recraft-remove-background"
      | "851-labs/background-remover"
      | "bria/remove-background"
      | "nightmareai/real-esrgan";

    export type ImageToolModelCategory =
      | "image/tool/remove-background"
      | "image/tool/upscale";

    export type ImageToolModelCard = {
      id: ImageToolModelId;
      label: string;
      release: ModelRelease;
      url: string;
      category: ImageToolModelCategory;
      /** Cost per invocation in USD (flat rate from provider). */
      cost_usd: number;
    };

    export const models: Record<
      ImageToolModelId,
      ImageToolModelCard
    > /* generated:facts:image_tools.models:start */ = {
      "recraft-ai/recraft-remove-background": {
        id: "recraft-ai/recraft-remove-background",
        label: "Recraft Remove Background",
        release: {
          date: null,
          basis: "provider_endpoint",
          source_url:
            "https://replicate.com/recraft-ai/recraft-remove-background/versions",
        },
        url: "https://replicate.com/recraft-ai/recraft-remove-background",
        category: "image/tool/remove-background",
        cost_usd: 0.01,
      },
      "851-labs/background-remover": {
        id: "851-labs/background-remover",
        label: "851 Labs Background Remover",
        release: {
          date: null,
          basis: "provider_endpoint",
          source_url:
            "https://replicate.com/851-labs/background-remover/versions",
        },
        url: "https://replicate.com/851-labs/background-remover",
        category: "image/tool/remove-background",
        cost_usd: 0.00048,
      },
      "bria/remove-background": {
        id: "bria/remove-background",
        label: "Bria Remove Background",
        release: {
          date: "2024-11-12",
          basis: "model",
          source_url:
            "https://bria.ai/blog/brias-new-state-of-the-art-remove-background-outperforms-the-competition",
        },
        url: "https://replicate.com/bria/remove-background",
        category: "image/tool/remove-background",
        cost_usd: 0.018,
      },
      "nightmareai/real-esrgan": {
        id: "nightmareai/real-esrgan",
        label: "Real-ESRGAN",
        release: {
          date: "2021-07-22",
          basis: "model",
          source_url:
            "https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.1.0",
        },
        url: "https://replicate.com/nightmareai/real-esrgan",
        category: "image/tool/upscale",
        cost_usd: 0.002,
      },
    } /* generated:facts:image_tools.models:end */ as const;
  }

  // ── models.embedding ──────────────────────────────────────────────

  /**
   * Embedding-model catalogue.
   *
   * Powers the Grida Library retrieval pipeline: a single multimodal
   * model embeds both an asset's image (`__image` vector) and its text
   * (`__text` vector), and the editor embeds the search query — all into
   * one shared space so similarity (image↔image) and semantic search
   * (text↔text, with a cross-modal floor) are comparable.
   *
   * This card is the SINGLE SOURCE OF THE CONSISTENCY INVARIANT: the
   * worker (document side) and the editor (query side) MUST use the same
   * `id`, `dimensions`, and normalization. Drift makes the stored vectors
   * and query vectors incomparable and silently breaks retrieval.
   *
   * Provider routing is a runtime concern (prod = Vercel AI Gateway,
   * local prep = OpenRouter via BYOK precedence); the `id` is identical
   * across both, so the catalogue carries no provider binding.
   */
  export namespace embedding {
    export type EmbeddingModelId = "google/gemini-embedding-2";

    export type EmbeddingModelCategory = "embedding/multimodal";

    /**
     * Per-input-token pricing (USD per 1M tokens). Embeddings are
     * input-only — there is no output charge.
     */
    export type PerTokenInputPricing = {
      type: "per_token_input";
      input: number;
    };

    export type EmbeddingModelCard = {
      id: EmbeddingModelId;
      label: string;
      release: ModelRelease;
      deprecated: boolean;
      short_description: string;
      vendor: Vendor;
      category: EmbeddingModelCategory;
      /**
       * Configured output dimensionality for the Grida pipeline. MUST equal
       * the DB `vector(N)` column dim and the worker's configured dim.
       * Gemini Embedding 2 is natively 3072 and Matryoshka-truncatable to
       * 1536 / 768; the library pipeline uses 1536 (largest dim indexable
       * under pgvector's HNSW 2000-dim cap).
       */
      dimensions: number;
      /**
       * Whether output vectors are unit-normalized (cosine-ready). The
       * pipeline L2-normalizes after MRL truncation regardless; this
       * records the contract both sides rely on.
       */
      normalized: boolean;
      /** Accepts image AND text inputs into one shared space. */
      multimodal: boolean;
      pricing: PerTokenInputPricing;
      /**
       * Coarse per-call budget estimate in USD (rate-limiter only, not
       * displayed). A search query is a handful of tokens, so this is
       * negligible.
       */
      avg_cost_usd: number;
      /** Public model page. */
      url: string;
    };

    export const models: Record<
      EmbeddingModelId,
      EmbeddingModelCard
    > /* generated:facts:embedding.models:start */ = {
      "google/gemini-embedding-2": {
        id: "google/gemini-embedding-2",
        label: "Gemini Embedding 2",
        release: {
          date: "2026-03-10",
          basis: "model",
          source_url: "https://ai.google.dev/gemini-api/docs/changelog",
        },
        deprecated: false,
        short_description:
          "Natively multimodal embedding (text + image into one space); 3072-d, MRL-truncatable.",
        vendor: "google",
        category: "embedding/multimodal",
        dimensions: 1536,
        normalized: true,
        multimodal: true,
        pricing: {
          type: "per_token_input",
          input: 0.15,
        },
        avg_cost_usd: 0.00002,
        url: "https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2-preview",
      },
    } /* generated:facts:embedding.models:end */ as const;

    export const embedding_model_ids = Object.keys(
      models
    ) as EmbeddingModelId[];

    export function modelCardById(id: string): EmbeddingModelCard | undefined {
      return (models as Record<string, EmbeddingModelCard>)[id];
    }

    /**
     * Canonical model id + dim used by BOTH the editor query embedder and
     * the worker. Import these rather than hard-coding to keep the two
     * sides in lock-step.
     */
    export const LIBRARY_EMBEDDING_MODEL_ID: EmbeddingModelId =
      "google/gemini-embedding-2";
    export const LIBRARY_EMBEDDING_DIMENSIONS = 1536;
  }
}

// Bundled values are shared across importers. Freeze every nested fact.
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
freeze(models);

export default models;
