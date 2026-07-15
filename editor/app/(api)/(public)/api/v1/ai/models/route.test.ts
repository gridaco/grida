// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * GET /api/v1/ai/models — token-gated allowlist composed from the ONE
 * catalog: all text entries (deprecated flagged), image/video cards
 * with vercel bindings; tier annotation from the reverse tier map; no
 * pricing fields anywhere in the payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Rate limits are pinned by their own module; route tests must NEVER
// reach the real Upstash instance (vitest loads .env.local).
vi.mock("@/lib/ai/openai-compat/limits", () => ({
  allowAiRequest: async () => ({ success: true }),
}));

import { GET } from "./route";
import { signGgToken } from "@/lib/auth/gg-token";

const SECRET = "models-secret-0123456789abcdef0123456789abcdef";

function request(token?: string): Request {
  return new Request("http://grida.test/api/v1/ai/models", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  process.env.GG_TOKEN_SECRET = SECRET;
});

type Entry = {
  id: string;
  grida: { modality: string; tier: string | null; deprecated: boolean };
};

describe("GET /api/v1/ai/models", () => {
  it("401 without a valid token", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("junk"))).status).toBe(401);
  });

  it("lists text+image+video with tiers, deprecation flags, and no pricing", async () => {
    const { token } = await signGgToken("user-1", 7);
    const res = await GET(request(token));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { object: string; data: Entry[] };
    expect(body.object).toBe("list");

    const byId = new Map(body.data.map((entry) => [entry.id, entry]));
    // Tier annotation via the reverse TIER_MODEL_IDS map.
    for (const [tier, id] of [
      ["nano", "openai/gpt-5.4-nano"],
      ["mini", "openai/gpt-5.6-luna"],
      ["pro", "openai/gpt-5.6-terra"],
      ["max", "openai/gpt-5.6-sol"],
    ] as const) {
      expect(byId.get(id)?.grida).toMatchObject({ modality: "text", tier });
    }
    for (const id of [
      "anthropic/claude-fable-5",
      "anthropic/claude-opus-4.8",
    ]) {
      expect(byId.get(id)?.grida).toMatchObject({
        modality: "text",
        tier: null,
        deprecated: false,
      });
    }
    // Every modality is represented.
    const modalities = new Set(body.data.map((e) => e.grida.modality));
    expect(modalities).toEqual(new Set(["text", "image", "video"]));
    // No pricing leaks into the payload.
    expect(JSON.stringify(body)).not.toMatch(/cost|price|usd|mills/i);
  });
});
