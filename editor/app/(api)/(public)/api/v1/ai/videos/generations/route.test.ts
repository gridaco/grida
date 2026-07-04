// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * POST /api/v1/ai/videos/generations — route-level pins (the seam's
 * `generateVideo` behavior is pinned by `generate-video.test.ts`):
 * token-gated, org from the claim, InvalidAiRequestError → 400,
 * blocked → 402, verbatim result passthrough, no-store.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Rate limits are pinned by their own module; route tests must NEVER
// reach the real Upstash instance (vitest loads .env.local).
vi.mock("@/lib/ai/openai-compat/limits", () => ({
  allowAiRequest: async () => ({ success: true }),
}));

const generateVideo = vi.fn<(org: number, req: unknown) => Promise<unknown>>();
vi.mock("@/lib/ai/server", () => {
  class InvalidAiRequestError extends Error {
    code = "invalid_request";
  }
  return {
    InvalidAiRequestError,
    methods: {
      generateVideo: (org: number, req: unknown) => generateVideo(org, req),
    },
  };
});

import { POST } from "./route";
import { signGgToken } from "@/lib/auth/gg-token";

const SECRET = "videos-secret-0123456789abcdef0123456789abcdef";

function request(body: unknown, token?: string): Request {
  return new Request("http://grida.test/api/v1/ai/videos/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.GG_TOKEN_SECRET = SECRET;
  generateVideo.mockReset();
});

describe("POST /api/v1/ai/videos/generations", () => {
  it("401 without a token; seam never invoked", async () => {
    const res = await POST(
      request({ model_id: "google/veo-3.1", prompt: "x" })
    );
    expect(res.status).toBe(401);
    expect(generateVideo).not.toHaveBeenCalled();
  });

  it("passes the claim org + request through and returns the result verbatim", async () => {
    const result = {
      model_id: "google/veo-3.1",
      provider_id: "vercel",
      videos: [{ base64: "AAAA", media_type: "video/mp4" }],
    };
    generateVideo.mockResolvedValue(result);
    const { token } = await signGgToken("user-1", 7);
    const res = await POST(
      request(
        { model_id: "google/veo-3.1", prompt: "ocean", duration: 8 },
        token
      )
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual(result);
    expect(generateVideo).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        model_id: "google/veo-3.1",
        prompt: "ocean",
        duration: 8,
      })
    );
  });

  it("maps seam validation failures to 400 and blocked to 402", async () => {
    const { token } = await signGgToken("user-1", 7);
    const { InvalidAiRequestError } = await import("@/lib/ai/server");
    generateVideo.mockRejectedValue(
      new InvalidAiRequestError("unsupported resolution")
    );
    const res400 = await POST(
      request({ model_id: "google/veo-3.1", prompt: "x" }, token)
    );
    expect(res400.status).toBe(400);
    expect(JSON.stringify(await res400.json())).toContain(
      "unsupported resolution"
    );

    generateVideo.mockRejectedValue(
      Object.assign(new Error("gate: below_floor"), { code: "blocked" })
    );
    const res402 = await POST(
      request({ model_id: "google/veo-3.1", prompt: "x" }, token)
    );
    expect(res402.status).toBe(402);
    expect(JSON.stringify(await res402.json())).toContain(
      "insufficient_credits"
    );
  });

  it("400 on malformed body without touching the seam", async () => {
    const { token } = await signGgToken("user-1", 7);
    const res = await POST(request({ prompt: "no model" }, token));
    expect(res.status).toBe(400);
    expect(generateVideo).not.toHaveBeenCalled();
  });
});
