import { describe, expect, it } from "vitest";
import { buildDesktopCsp } from "./lib/desktop/csp";

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

  // #924 — workspace media streams over the `grida-workspace:` privileged
  // scheme (proxied to the sidecar, no 1 MiB base64 cap). Pin it on both img and
  // media so dropping it silently reverts the viewer to the base64 fallback.
  it.each(["img-src", "media-src"])(
    "%s allows the grida-workspace: streaming scheme (#924)",
    (name) => {
      expect(directive(name)).toContain("grida-workspace:");
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

  // The first-party Grida Library (the app's own Supabase storage) IS allowed in
  // img-src: reference pins are kept as URLs and rendered directly. It is one
  // first-party origin, image-only — distinct from generation-provider CDNs.
  describe("first-party library carve-out", () => {
    const libOrigin = "https://proj-all.supabase.co";
    const withLib = buildDesktopCsp("n", libOrigin);
    const directiveOf = (src: string, name: string): string =>
      src
        .split(";")
        .map((d) => d.trim())
        .find((d) => d === name || d.startsWith(`${name} `))!;

    it("allowlists the first-party library origin in img-src only", () => {
      expect(directiveOf(withLib, "img-src")).toContain(libOrigin);
      // image only — not media-src, not connect-src
      expect(directiveOf(withLib, "media-src")).not.toContain(libOrigin);
      expect(directiveOf(withLib, "connect-src")).not.toContain(libOrigin);
    });

    it("still excludes generation-provider CDNs with the library origin set", () => {
      for (const host of ["fal.media", "openrouter.ai"]) {
        expect(directiveOf(withLib, "img-src")).not.toContain(host);
      }
    });

    it("omits the library origin when env is unset (no widening on empty)", () => {
      expect(directiveOf(buildDesktopCsp("n", ""), "img-src")).toBe(
        "img-src 'self' data: blob: grida-workspace:"
      );
    });
  });

  it("connect-src reaches the loopback agent sidecar", () => {
    expect(directive("connect-src")).toContain("http://127.0.0.1:*");
  });

  it("connect-src does NOT allow localhost in prod (dev-HMR only)", () => {
    // Tests run with NODE_ENV !== "development" → the production CSP. A
    // renderer/XSS bug must not be able to probe arbitrary localhost services.
    expect(directive("connect-src")).not.toContain("localhost");
  });
});
