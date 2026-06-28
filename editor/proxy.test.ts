import { describe, expect, it } from "vitest";
import { buildDesktopCsp } from "./proxy";

/**
 * GRIDA-SEC-004 — desktop CSP contract.
 *
 * Pins the directive set so the failure mode that broke BYOK video (#908)
 * can't recur: a renderer-loaded resource type with no matching directive
 * silently falls back to `default-src 'self'` and is blocked at runtime, with
 * no compile/test signal. Any directive change is a conscious edit here.
 *
 * Rule this encodes: every kind of content the desktop renderer loads has an
 * explicit directive. Generated media (image/video) is returned by the sidecar
 * as bytes and played from `data:`/`blob:` — never an external origin — so
 * `img-src` and `media-src` must allow `data:`/`blob:` and NOT list provider
 * hosts.
 */
describe("desktop CSP (GRIDA-SEC-004)", () => {
  const csp = buildDesktopCsp("test-nonce");

  const directive = (name: string): string => {
    const found = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d === name || d.startsWith(`${name} `));
    if (!found) throw new Error(`CSP missing directive: ${name}`);
    return found;
  };

  it("locks the base to self", () => {
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
  });

  it("carries the per-request script nonce", () => {
    expect(directive("script-src")).toContain("'nonce-test-nonce'");
  });

  // Generated media is sidecar-downloaded → played as data:/blob:. Both image
  // AND video must be covered, or one modality silently breaks (the #908 bug).
  it.each(["img-src", "media-src"])(
    "%s allows data: and blob: (sidecar-bytes contract)",
    (name) => {
      const d = directive(name);
      expect(d).toContain("'self'");
      expect(d).toContain("data:");
      expect(d).toContain("blob:");
    }
  );

  it("does NOT allowlist external provider media origins", () => {
    // Generated media never streams from a provider CDN — it's bytes from the
    // sidecar. If someone adds a provider host here, this is the wrong fix.
    for (const host of ["fal.media", "openrouter.ai", "vercel", "googleapis"]) {
      expect(directive("media-src")).not.toContain(host);
      expect(directive("img-src")).not.toContain(host);
    }
  });

  it("connect-src reaches the loopback agent sidecar", () => {
    expect(directive("connect-src")).toContain("http://127.0.0.1:*");
  });
});
