/**
 * Route pin for `POST /providers/claude/detect` (issue #813 zero-config
 * onboarding). The handler is a thin wrapper over `detectClaude`; the test
 * injects a fake `detect` (the same `deps` seam `probe` uses) so it asserts the
 * wire — the result is JSON-passed through verbatim — without touching the real
 * filesystem. The resolver itself is covered in `agent-provider/detect.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { EndpointProvidersStore } from "../../providers/endpoints";
import { registerProvidersRoutes } from "./providers";

/** The claude-detect route never touches the endpoints store. */
const noEndpoints = {} as unknown as EndpointProvidersStore;

function appWithDetect(detect: () => { installed: boolean; path?: string }) {
  const app = new Hono();
  registerProvidersRoutes(app, { endpoints: noEndpoints, detect });
  return app;
}

describe("POST /providers/claude/detect", () => {
  it("returns the installed result with the resolved path", async () => {
    const app = appWithDetect(() => ({
      installed: true,
      path: "/home/u/.local/bin/claude",
    }));
    const res = await app.request("/providers/claude/detect", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      installed: true,
      path: "/home/u/.local/bin/claude",
    });
  });

  it("returns not-installed when the resolver finds nothing", async () => {
    const app = appWithDetect(() => ({ installed: false }));
    const res = await app.request("/providers/claude/detect", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ installed: false });
  });
});
