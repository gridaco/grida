// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
// GRIDA-EE: billing — see platform-consumers
/**
 * `POST /api/v1/ai/chat/completions` — OpenAI chat-completions wire over
 * the billed Grida model seam. The desktop sidecar's `grida` provider
 * (`@ai-sdk/openai-compatible`, `baseURL = <origin>/api/v1/ai`) is the
 * primary consumer.
 *
 * Auth: the scoped AI token ONLY (`verifyGgToken` — never Supabase
 * tokens, never cookies; GRIDA-SEC-006). Org context comes from the
 * token claim (membership was verified at mint).
 *
 * Billing: entirely the seam's — `grida.languageModel()` carries the
 * billing middleware (`lib/ai/server.ts`), so the entitlement gate runs
 * BEFORE the upstream opens (a 402 is always a clean pre-stream JSON
 * response, never a mid-stream corpse) and usage is ingested on the
 * finish part. One request per agent step ⇒ per-request gating IS
 * step-level gating (Q-AI-2 resolved for desktop by construction).
 *
 * BYOK interplay (GRIDA-SEC-003): with a `BYOK_*` env set (contributor
 * dev), the language provider is the bare BYOK provider — calls here
 * are authenticated but unbilled, exactly like every other text
 * surface under that carve-out.
 */
import { NativeChatRoute } from "@/lib/ai/native-chat-route";

export const maxDuration = 300;
export const POST = NativeChatRoute.ordinary;
