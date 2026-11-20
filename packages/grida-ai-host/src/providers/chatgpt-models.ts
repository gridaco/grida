// GRIDA-SEC-008 — only scoped, bounded capability facts leave subscription discovery.
import {
  CHATGPT_SUBSCRIPTION_WIRE_MODEL_BY_ID,
  type ChatGptSubscriptionModelId,
  type ChatGptTurnCapabilities,
} from "../protocol/chatgpt";

const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const FRESH_MS = 5 * 60 * 1000;
type Offer = ReadonlyMap<string, ChatGptTurnCapabilities>;
type Result = Offer | "unavailable" | "reauthenticationRequired";

export function noSubscriptionFeatures(
  status: Exclude<ChatGptTurnCapabilities["status"], "available">
): ChatGptTurnCapabilities {
  return { status, speeds: [], webSearch: false };
}

/** One host has one active OAuth lineage. A replaced cache entry cannot be
 * refilled by a late completion for a previous account. */
export class ChatGptModels {
  private current?: {
    scope: string;
    expires: number;
    result: Promise<Result>;
  };

  async capabilities(
    scope: string,
    model: ChatGptSubscriptionModelId,
    get: (signal: AbortSignal) => Promise<Response>
  ): Promise<ChatGptTurnCapabilities> {
    let entry = this.current;
    if (!entry || entry.scope !== scope || entry.expires <= Date.now()) {
      const result = readCatalog(get).catch(() => "unavailable" as const);
      const fetching = { scope, expires: Infinity, result };
      entry = this.current = fetching;
      // Bound repeated failing discovery too. An authoritative denial never
      // revives an older positive snapshot.
      void result.then((value) => {
        fetching.expires =
          Date.now() + (typeof value === "string" ? 3000 : FRESH_MS);
      });
    }
    const offer = await entry.result;
    if (typeof offer === "string") return noSubscriptionFeatures(offer);
    const match = offer.get(CHATGPT_SUBSCRIPTION_WIRE_MODEL_BY_ID[model]);
    return match
      ? { ...match, speeds: [...match.speeds] }
      : noSubscriptionFeatures("unsupported");
  }
}

async function readCatalog(
  get: (signal: AbortSignal) => Promise<Response>
): Promise<Result> {
  const signal = AbortSignal.timeout(8000);
  const response = await get(signal);
  const reader = response.body?.getReader();
  try {
    if (response.status === 401) return "reauthenticationRequired";
    if (
      !response.ok ||
      response.redirected ||
      !reader ||
      !/^application\/json(?:\s*;|$)/i.test(
        response.headers.get("content-type") ?? ""
      ) ||
      Number(response.headers.get("content-length")) > MAX_CATALOG_BYTES
    )
      return "unavailable";
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_CATALOG_BYTES) return "unavailable";
      chunks.push(next.value);
    }
    const raw: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks, size)
      )
    );
    if (
      !raw ||
      typeof raw !== "object" ||
      !("models" in raw) ||
      !Array.isArray(raw.models) ||
      raw.models.length > 2048
    )
      return "unavailable";
    const models = new Map<string, ChatGptTurnCapabilities>();
    const installed = Object.values(CHATGPT_SUBSCRIPTION_WIRE_MODEL_BY_ID);
    for (const row of raw.models) {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        typeof row.slug !== "string" ||
        !row.slug
      )
        return "unavailable";
      if (!installed.includes(row.slug)) continue;
      if (models.has(row.slug)) return "unavailable";
      // Whitelist the small projection. Provider-owned prompts, remote tools,
      // suggested defaults, and unrelated models are never configuration.
      if (row.visibility !== "list") {
        models.set(
          row.slug,
          noSubscriptionFeatures(
            row.visibility === "hide" || row.visibility === "none"
              ? "unsupported"
              : "unavailable"
          )
        );
        continue;
      }
      // The upstream catalog omits an empty tier list. An offered model
      // with no acceleration can still support hosted search.
      const tiers = row.service_tiers === undefined ? [] : row.service_tiers;
      if (
        !Array.isArray(tiers) ||
        tiers.length > 64 ||
        tiers.some(
          (t: unknown) =>
            !t ||
            typeof t !== "object" ||
            !("id" in t) ||
            typeof t.id !== "string"
        )
      ) {
        models.set(row.slug, noSubscriptionFeatures("unavailable"));
        continue;
      }
      const ids = new Set(tiers.map((t: { id: string }) => t.id));
      const speeds: ("fast" | "ultrafast")[] = [];
      if (ids.has("priority")) speeds.push("fast");
      if (ids.has("ultrafast")) speeds.push("ultrafast");
      // Directly verified on our full HTTP Responses adapter. The catalog's
      // Responses Lite preference describes a different transport.
      models.set(row.slug, {
        status: "available",
        speeds,
        webSearch:
          row.slug ===
          CHATGPT_SUBSCRIPTION_WIRE_MODEL_BY_ID["openai/gpt-6.2-sol"],
      });
    }
    return models;
  } finally {
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}
