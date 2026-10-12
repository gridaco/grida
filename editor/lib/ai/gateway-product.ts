// GRIDA-GG: gateway — trusted, organization-scoped server execution.
import "server-only";
import { randomUUID } from "node:crypto";
import type { ImageModelV3, LanguageModelV3 } from "@ai-sdk/provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { ProductBillingError } from "@/lib/platform/product-billing";

export type GatewayContext = {
  organizationId: number;
  feature: string;
  transactionId?: string;
};
export class GatewayProductError extends Error {
  readonly isRetryable = false;
  constructor(
    readonly status: number,
    readonly code: string,
    readonly requestId?: string
  ) {
    super(
      status === 400
        ? "This request is not supported by the selected model."
        : `AI execution did not finish normally${requestId ? ` (${requestId})` : ""}. It may still be running or charged. Do not repeat accepted work.`
    );
    this.name = "GatewayProductError";
  }
}
function configuration() {
  const raw = process.env.GRIDA_AI_GATEWAY_ORIGIN;
  const key = process.env.GRIDA_AI_GATEWAY_KEY_ID;
  const token = process.env.GRIDA_AI_GATEWAY_TOKEN;
  if (
    !raw ||
    !key ||
    !token ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(key) ||
    !/^[A-Za-z0-9_-]{43,256}$/.test(token)
  )
    throw new ProductBillingError();
  const url = new URL(raw);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        process.env.GRIDA_AI_GATEWAY_ALLOW_LOCAL === "1" &&
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      ))
  )
    throw new ProductBillingError();
  return { origin: url.origin, key, token };
}
export function gatewayContext(options: unknown): GatewayContext {
  const g = (options as { grida?: GatewayContext } | undefined)?.grida;
  if (
    !g ||
    !Number.isSafeInteger(g.organizationId) ||
    g.organizationId <= 0 ||
    !/^[A-Za-z0-9][A-Za-z0-9/_.:-]{0,127}$/.test(g.feature)
  )
    throw new GatewayProductError(400, "missing_organization_id");
  return g;
}

/** One original HTTP submission. Neither transport nor adapter retries paid work. */
export async function gatewayFetch(
  ctx: GatewayContext,
  path: string,
  init: RequestInit = {},
  identity?: string
): Promise<Response> {
  gatewayContext({ grida: ctx });
  if (
    !/^\/v1\/(?:models|endpoints|chat\/completions|images\/(?:generations|edits)|videos|jobs\/req_[A-Za-z0-9_-]+|endpoints\/[A-Za-z0-9._-]+)$/.test(
      path
    )
  )
    throw new GatewayProductError(400, "invalid_operation");
  const c = configuration();
  const headers = new Headers();
  if (!(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${c.token}`);
  headers.set("X-Grida-Workload-Key-ID", c.key);
  headers.set("X-Grida-Organization-ID", String(ctx.organizationId));
  headers.set("X-Grida-Feature", ctx.feature);
  if (identity) headers.set("Idempotency-Key", identity);
  let response: Response;
  try {
    response = await fetch(`${c.origin}/internal/grida${path}`, {
      ...init,
      headers,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([
        AbortSignal.timeout(600_000),
        ...(init.signal ? [init.signal] : []),
      ]),
    });
  } catch {
    throw new GatewayProductError(502, "submission_uncertain");
  }
  if (!response.ok) {
    const requestId = response.headers.get("X-Request-ID") ?? undefined;
    const value = await response.json().catch(() => null);
    if (response.status === 402) throw new ProductBillingError("blocked");
    throw new GatewayProductError(
      response.status,
      typeof value?.error?.code === "string"
        ? value.error.code
        : "upstream_unavailable",
      requestId
    );
  }
  return response;
}
export type GatewayJob = {
  id: string;
  request_id: string;
  model: string | null;
  status: string;
  result_status: string;
  result: Record<string, unknown> | null;
  billing: {
    status: string;
    charged_mills: string | null;
    authorized_mills: string;
  };
};
export async function gatewayJob(
  ctx: GatewayContext,
  id: string
): Promise<GatewayJob> {
  const response = await gatewayFetch(ctx, `/v1/jobs/${id}`);
  const value = await response.json();
  if (
    value.id !== id ||
    value.request_id !== id ||
    !value.billing ||
    typeof value.result_status !== "string"
  )
    throw new GatewayProductError(502, "invalid_response", id);
  return value;
}
export async function gatewayWait(
  ctx: GatewayContext,
  id: string,
  signal?: AbortSignal
): Promise<GatewayJob> {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    const job = await gatewayJob(ctx, id);
    if (job.result_status === "available") return job;
    if (
      ["expired", "unavailable"].includes(job.result_status) ||
      job.status === "failed"
    )
      throw new GatewayProductError(502, "result_unavailable", id);
    await new Promise<void>((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
        reject(new GatewayProductError(499, "aborted", id));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", stop);
        resolve();
      }, 1000);
      signal?.addEventListener("abort", stop, { once: true });
      if (signal?.aborted) stop();
    });
  }
  throw new GatewayProductError(504, "result_pending", id);
}
async function charge(ctx: GatewayContext, id: string | null) {
  if (!id) throw new GatewayProductError(502, "missing_request_identity");
  try {
    const job = await gatewayJob(ctx, id);
    return {
      requestId: id,
      billingStatus: job.billing.status,
      chargedMills: job.billing.charged_mills,
    };
  } catch {
    // Execution and settlement continue in GG. A status read failure must not
    // throw away an already delivered result or encourage paid regeneration.
    return { requestId: id, billingStatus: "pending", chargedMills: null };
  }
}
export function gatewayCostMills(metadata: unknown): number | undefined {
  const gg = (
    metadata as
      | {
          gg?: {
            chargedMills?: unknown;
            images?: Array<{ requestId?: string; chargedMills?: unknown }>;
          };
        }
      | undefined
  )?.gg;
  const charges = gg?.chargedMills !== undefined ? [gg] : gg?.images;
  if (!charges?.length) return undefined;
  const seen = new Set<string>();
  let total = 0;
  for (const item of charges) {
    if ("requestId" in item && item.requestId) {
      if (seen.has(item.requestId)) continue;
      seen.add(item.requestId);
    }
    if (
      typeof item.chargedMills !== "string" ||
      !/^\d+(?:\.\d+)?$/.test(item.chargedMills)
    )
      return undefined;
    const value = Number(item.chargedMills);
    if (!Number.isFinite(value) || value < 0) return undefined;
    total += value;
  }
  return Number.isFinite(total) ? total : undefined;
}
export function gatewayLanguageModel(modelId: string): LanguageModelV3 {
  function vendorWarnings(
    options: Parameters<LanguageModelV3["doGenerate"]>[0]
  ) {
    return Object.keys(options.providerOptions ?? {})
      .filter(
        (key) =>
          !["grida", "gg", "openaiCompatible", "openai-compatible"].includes(
            key
          )
      )
      .map((key) => ({
        type: "unsupported" as const,
        feature: `providerOptions.${key}`,
        details:
          "Grida Gateway uses its declared compatible contract; provider-native controls are not forwarded.",
      }));
  }
  function delegate(options: Parameters<LanguageModelV3["doGenerate"]>[0]) {
    const ctx = gatewayContext(options.providerOptions);
    const identity = ctx.transactionId ?? randomUUID();
    let requestId: string | null = null;
    const provider = createOpenAICompatible({
      supportsStructuredOutputs: true,
      name: "gg",
      baseURL: "https://gateway.grida.ai/v1",
      apiKey: "server-authority",
      fetch: async (_url, init) => {
        const response = await gatewayFetch(
          ctx,
          "/v1/chat/completions",
          init,
          identity
        );
        requestId = response.headers.get("X-Request-ID");
        return response;
      },
    });
    return {
      ctx,
      model: provider.chatModel(modelId),
      identity: () => requestId,
    };
  }
  return {
    specificationVersion: "v3",
    provider: "gg",
    modelId,
    supportedUrls: { "image/*": [/^https:\/\//] },
    async doGenerate(options) {
      const d = delegate(options);
      try {
        const value = await d.model.doGenerate(options);
        return {
          ...value,
          warnings: [...value.warnings, ...vendorWarnings(options)],
          providerMetadata: {
            ...value.providerMetadata,
            gg: await charge(d.ctx, d.identity()),
          },
        };
      } catch (error) {
        if (
          error instanceof GatewayProductError ||
          error instanceof ProductBillingError
        )
          throw error;
        throw new GatewayProductError(
          502,
          "invalid_response",
          d.identity() ?? undefined
        );
      }
    },
    async doStream(options) {
      const d = delegate(options);
      try {
        const value = await d.model.doStream(options);
        return {
          ...value,
          stream: value.stream.pipeThrough(
            new TransformStream({
              async transform(part, controller) {
                if (part.type === "stream-start") {
                  controller.enqueue({
                    ...part,
                    warnings: [...part.warnings, ...vendorWarnings(options)],
                  });
                } else if (part.type === "finish") {
                  const metadata = await charge(d.ctx, d.identity());
                  controller.enqueue({
                    ...part,
                    providerMetadata: {
                      ...part.providerMetadata,
                      gg: metadata,
                    },
                  });
                } else controller.enqueue(part);
              },
            })
          ),
        };
      } catch (error) {
        if (
          error instanceof GatewayProductError ||
          error instanceof ProductBillingError
        )
          throw error;
        throw new GatewayProductError(
          502,
          "invalid_response",
          d.identity() ?? undefined
        );
      }
    },
  };
}
/** Translate native pixel dimensions to each released GG model contract.
 * These are transport/capability mappings, never a second price catalogue. */
function imageGeometry(modelId: string, size?: string, aspectRatio?: string) {
  const pair = size?.match(/^(\d+)x(\d+)$/);
  if (size && !pair)
    throw new GatewayProductError(400, "unsupported_image_size");
  const ratio = aspectRatio?.match(/^(\d+):(\d+)$/);
  if (aspectRatio && (!ratio || Number(ratio[1]) <= 0 || Number(ratio[2]) <= 0))
    throw new GatewayProductError(400, "unsupported_image_aspect_ratio");
  const width = pair ? Number(pair[1]) : undefined;
  const height = pair ? Number(pair[2]) : undefined;
  if (
    width !== undefined &&
    (!Number.isSafeInteger(width) ||
      !height ||
      !Number.isSafeInteger(height) ||
      width <= 0)
  )
    throw new GatewayProductError(400, "unsupported_image_size");
  const targetRatio = ratio ? Number(ratio[1]) / Number(ratio[2]) : undefined;
  if (
    width &&
    height &&
    targetRatio &&
    Math.abs(width / height - targetRatio) > 0.02
  )
    throw new GatewayProductError(400, "conflicting_image_dimensions");
  const reducedRatio =
    width && height
      ? `${width / gcd(width, height)}:${height / gcd(width, height)}`
      : undefined;
  if (modelId.startsWith("google/")) {
    const axis = width && height ? Math.max(width, height) : undefined;
    const tier =
      axis === undefined
        ? undefined
        : (
            { 512: "0.5K", 1024: "1K", 2048: "2K", 4096: "4K" } as Record<
              number,
              string
            >
          )[axis];
    if (axis && !tier)
      throw new GatewayProductError(400, "unsupported_image_size");
    return { size: tier, aspect_ratio: aspectRatio ?? reducedRatio };
  }
  if (modelId.startsWith("xai/")) {
    const axis = width && height ? Math.max(width, height) : undefined;
    if (axis && axis !== 1024 && axis !== 2048)
      throw new GatewayProductError(400, "unsupported_image_size");
    return {
      size: axis === 2048 ? "2k" : axis === 1024 ? "1k" : undefined,
      aspect_ratio: aspectRatio ?? reducedRatio,
    };
  }
  if (modelId.startsWith("recraft/")) {
    const presets: Record<string, string> = {
      "1024x1024": "square_hd",
      "512x512": "square",
      "768x1024": "portrait_4_3",
      "576x1024": "portrait_16_9",
      "1024x768": "landscape_4_3",
      "1024x576": "landscape_16_9",
    };
    const ratios: Record<string, string> = {
      "1:1": "square_hd",
      "3:4": "portrait_4_3",
      "9:16": "portrait_16_9",
      "4:3": "landscape_4_3",
      "16:9": "landscape_16_9",
    };
    const preset = size
      ? presets[size]
      : aspectRatio
        ? ratios[aspectRatio]
        : undefined;
    if ((size || aspectRatio) && !preset)
      throw new GatewayProductError(400, "unsupported_image_size");
    return { size: preset };
  }
  // Pixel-size models do not accept a separate aspect_ratio field. Convert an
  // aspect-only request to bounded pixel dimensions, leaving GG's validator
  // authoritative for model limits, rounding, price and reference count.
  if (!size && targetRatio) {
    const axis = modelId === "bytedance/seedream-5.0-lite" ? 2048 : 1024;
    let w =
      Math.round((targetRatio >= 1 ? axis : axis * targetRatio) / 16) * 16;
    let h =
      Math.round((targetRatio >= 1 ? axis / targetRatio : axis) / 16) * 16;
    if (modelId === "bytedance/seedream-5.0-lite" && w * h < 3_686_400) {
      const scale = Math.sqrt(3_686_400 / (w * h));
      w = Math.ceil((w * scale) / 16) * 16;
      h = Math.ceil((h * scale) / 16) * 16;
    }
    size = `${w}x${h}`;
  }
  return { size };
}
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function gatewayImageModel(modelId: string): ImageModelV3 {
  return {
    specificationVersion: "v3",
    provider: "gg",
    modelId,
    maxImagesPerCall: Number.MAX_SAFE_INTEGER,
    async doGenerate(options) {
      const ctx = gatewayContext(options.providerOptions);
      if (options.mask) throw new GatewayProductError(400, "unsupported_mask");
      const vendorOptions = Object.entries(options.providerOptions)
        .filter(([key]) => key !== "grida")
        .map(([, value]) => value);
      const parameters: Record<string, unknown> = {};
      for (const extra of vendorOptions)
        for (const [key, value] of Object.entries(extra ?? {})) {
          if (!["quality", "background", "output_format"].includes(key))
            throw new GatewayProductError(400, "unsupported_image_option");
          if (parameters[key] !== undefined && parameters[key] !== value)
            throw new GatewayProductError(400, "conflicting_image_option");
          // GG always delivers image bytes. PNG selection is owned by its
          // operation contract; native alpha-safe PNG requests need no field.
          if (key === "output_format") {
            if (value !== "png")
              throw new GatewayProductError(400, "unsupported_image_format");
            continue;
          }
          parameters[key] = value;
        }
      const body = Object.fromEntries(
        Object.entries({
          ...parameters,
          model: modelId,
          prompt: options.prompt,
          n: options.n,
          ...imageGeometry(modelId, options.size, options.aspectRatio),
          seed: options.seed,
        }).filter(([, v]) => v !== undefined)
      );
      let payload: FormData | string = JSON.stringify(body);
      let path = "/v1/images/generations";
      if (options.files?.length) {
        const form = new FormData();
        for (const [key, value] of Object.entries(body))
          form.set(
            key,
            typeof value === "string" ? value : JSON.stringify(value)
          );
        for (const file of options.files) {
          if (file.type !== "file")
            throw new GatewayProductError(400, "image_bytes_required");
          const data =
            typeof file.data === "string"
              ? Uint8Array.from(Buffer.from(file.data, "base64"))
              : new Uint8Array(file.data);
          form.append(
            "image",
            new Blob([data], { type: file.mediaType }),
            "image"
          );
        }
        payload = form;
        path = "/v1/images/edits";
      }
      const response = await gatewayFetch(
        ctx,
        path,
        { method: "POST", body: payload, signal: options.abortSignal },
        ctx.transactionId ?? randomUUID()
      );
      const value = await response.json();
      if (
        !Array.isArray(value.data) ||
        value.data.length !== options.n ||
        value.data.some(
          (x: { b64_json?: unknown; media_type?: unknown }) =>
            typeof x.b64_json !== "string" || typeof x.media_type !== "string"
        )
      )
        throw new GatewayProductError(
          502,
          "invalid_response",
          response.headers.get("X-Request-ID") ?? undefined
        );
      const billing = await charge(ctx, response.headers.get("X-Request-ID"));
      return {
        images: value.data.map((x: { b64_json: string }) => x.b64_json),
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId,
          headers: Object.fromEntries(response.headers),
        },
        providerMetadata: {
          gg: {
            images: value.data.map((x: { media_type: string }) => ({
              mediaType: x.media_type,
              ...billing,
            })),
            ...billing,
          },
        },
      };
    },
  };
}
