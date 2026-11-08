// GRIDA-SEC-004 / GRIDA-SEC-006 — only safe accepted identities cross the renderer boundary.
import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { mediaGenerationError } from "./media-generation-errors";

function response(code: string, request_id: unknown) {
  const app = new Hono();
  app.get("/", (c) =>
    mediaGenerationError(c, {
      error: Object.assign(new Error(code), { code, request_id }),
      scope: "fixture",
      label: "music generation failed",
      model_id: "fixture/music",
      provider_id: "gg",
    })
  );
  return app.request("/");
}
describe("accepted media error identity", () => {
  it.each([
    ["gg_token_expired", 401],
    ["insufficient_credits", 402],
    ["provider_access_denied", 403],
    ["invalid_response", 502],
  ] as const)(
    "retains the validated ID on %s, including Electron's message-only projection",
    async (code, status) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const res = await response(code, "req_original_job");
        expect(res.status).toBe(status);
        expect(await res.json()).toMatchObject({
          request_id: "req_original_job",
          error: expect.stringContaining("GG request: req_original_job."),
        });
      } finally {
        log.mockRestore();
      }
    }
  );
  it.each([
    "req_bad\nprivate",
    "private-token",
    "req_" + "a".repeat(161),
    { secret: "private" },
  ])("does not expose an invalid identity", async (id) => {
    const res = await response("gg_token_expired", id);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "gg_token_expired: Grida session expired",
      code: "gg_token_expired",
      provider_id: "gg",
    });
  });
});
