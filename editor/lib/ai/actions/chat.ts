"use server";

/**
 * AI chat action — invoked by the `/ai` chat surface.
 */

import { generateText } from "ai";
import {
  grida,
  model,
  costMillsFromTokenUsage,
  costUsdFromTokenUsage,
  withAiAuth,
  type AiActionResult,
  type ProviderUsage,
} from "@/lib/ai/server";
import { catalog, tiers } from "@/lib/ai/models";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type RunChatInput = {
  /** Verified org id — server resolves via `requireOrganizationId`. */
  organizationId?: number;
  /**
   * Catalog model id (e.g. `"openai/gpt-5.5-pro"`). Defaults to the
   * `mini` tier. Unknown ids fall back to `mini` server-side.
   */
  model_id?: string;
  /** Prior conversation turns (chronological, oldest first). */
  history: ChatTurn[];
  /** New user message. */
  message: string;
};

export type RunChatData = {
  reply: string;
  /** Catalog id that was actually used. */
  model_id: string;
  /** Mills billed for this call (metered — matches what we sent to Metronome). */
  costMills: number;
  /**
   * Real per-token USD cost from the provider's rate card — un-rounded.
   * For cheap calls the delta against `costMills/1000` is the rounding
   * margin we keep.
   */
  realCostUsd: number;
  /** Token usage as reported by the provider. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens?: number;
  };
};

export type RunChatResponse = AiActionResult<RunChatData>;

const SYSTEM_PROMPT =
  "You are a concise assistant inside the Grida editor. Reply in plain text — no markdown, no code fences. Keep answers short unless the user asks for detail.";

// Server-side allowlist: only the tier-backed models the picker
// exposes. `isCatalogId` (any catalog entry) let a forged payload
// select reserved / non-tiered models — restrict to the 4 tiers.
const ALLOWED_CHAT_MODEL_IDS = new Set<string>([
  catalog[tiers.nano].id,
  catalog[tiers.mini].id,
  catalog[tiers.pro].id,
  catalog[tiers.max].id,
]);

/**
 * Coerce the AI SDK result.usage (whatever shape the provider returns)
 * into the structural `ProviderUsage` shape the cost helper wants.
 * Falls back to flat `{inputTokens, outputTokens}` if the rich shape
 * isn't present.
 */
function toProviderUsage(raw: unknown): ProviderUsage {
  if (!raw || typeof raw !== "object") {
    return { inputTokens: { total: 0 }, outputTokens: { total: 0 } };
  }
  const u = raw as Record<string, unknown>;
  const inAny = u.inputTokens;
  const outAny = u.outputTokens;
  const input =
    typeof inAny === "number"
      ? { total: inAny }
      : ((inAny as ProviderUsage["inputTokens"]) ?? { total: 0 });
  const output =
    typeof outAny === "number"
      ? { total: outAny }
      : ((outAny as ProviderUsage["outputTokens"]) ?? { total: 0 });
  return { inputTokens: input, outputTokens: output };
}

export async function runChat(input: RunChatInput): Promise<RunChatResponse> {
  if (!input.message?.trim()) {
    return {
      success: false,
      code: "bad_request",
      message: "message is required",
      status: 400,
    };
  }

  return withAiAuth(
    "ai/chat",
    input.organizationId,
    async (orgId) => {
      const requested = input.model_id;
      const useModelId =
        requested && ALLOWED_CHAT_MODEL_IDS.has(requested) ? requested : null;
      const languageModel = useModelId ? grida(useModelId) : model("mini");
      // Resolve the catalog id from the same source as `model("mini")` so
      // a tier remap can't desync the billed cost card from the SDK call.
      const resolvedId = useModelId ?? catalog[tiers.mini].id;

      const messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [
        { role: "system", content: SYSTEM_PROMPT },
        ...input.history.map((t) => ({ role: t.role, content: t.content })),
        { role: "user", content: input.message },
      ];

      const { text, usage } = await generateText({
        model: languageModel,
        messages,
        providerOptions: {
          grida: {
            organizationId: orgId,
            feature: "ai/chat",
          },
        },
      });

      const providerUsage = toProviderUsage(usage);
      const realCostUsd = costUsdFromTokenUsage(resolvedId, providerUsage);
      const costMills = costMillsFromTokenUsage(resolvedId, providerUsage);

      return {
        reply: text,
        model_id: resolvedId,
        costMills,
        realCostUsd,
        usage: {
          inputTokens: providerUsage.inputTokens.total ?? 0,
          outputTokens: providerUsage.outputTokens.total ?? 0,
          totalTokens:
            (providerUsage.inputTokens.total ?? 0) +
            (providerUsage.outputTokens.total ?? 0),
          cacheReadTokens: providerUsage.inputTokens.cacheRead,
        },
      } satisfies RunChatData;
    },
    // GRIDA-SEC-003: AI-SDK text path — BYOK swaps in a bare provider
    // with no billing middleware, so under BYOK there is no Grida spend.
    { byokBypass: true }
  );
}
