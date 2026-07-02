/**
 * GRIDA-SEC-004 — contract pins for the Referer-path guard (layer 4) and the
 * CORS middleware. Break-one-see-one-red: each case isolates one way the
 * perimeter must reject, so weakening any single check fails exactly one test.
 */
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  makeCorsMiddleware,
  makeRefererGuard,
  type DaemonHttpAccess,
} from "./origin";

const ACCESS: DaemonHttpAccess = {
  allowed_origins: ["https://grida.co"],
  allowed_referer_paths: ["/desktop"],
};

function appWithRefererGuard(): Hono {
  const app = new Hono();
  app.use("*", makeRefererGuard(ACCESS));
  app.get("/", (c) => c.text("ok"));
  return app;
}

describe("makeRefererGuard (GRIDA-SEC-004 layer 4)", () => {
  it("accepts a Referer at an allowed origin under an allowed path root", async () => {
    const app = appWithRefererGuard();
    const res = await app.request("/", {
      headers: { referer: "https://grida.co/desktop/workspace" },
    });
    expect(res.status).toBe(200);
  });

  it("rejects a request with no Referer (cannot be treated as same-origin)", async () => {
    const app = appWithRefererGuard();
    const res = await app.request("/");
    expect(res.status).toBe(403);
  });

  it("rejects a Referer from a non-allowed origin", async () => {
    const app = appWithRefererGuard();
    const res = await app.request("/", {
      headers: { referer: "https://evil.example/desktop" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a Referer whose path is outside the allowed root", async () => {
    const app = appWithRefererGuard();
    const res = await app.request("/", {
      headers: { referer: "https://grida.co/blog/post" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a path-traversal Referer that normalizes out of the root", async () => {
    // The browser/URL parser normalizes `/desktop/../blog` to `/blog` before
    // it reaches us, so traversal can't smuggle a non-/desktop path past the
    // prefix check.
    const app = appWithRefererGuard();
    const res = await app.request("/", {
      headers: { referer: "https://grida.co/desktop/../blog" },
    });
    expect(res.status).toBe(403);
  });

  it("does NOT treat a sibling prefix like /desktopX as inside /desktop", async () => {
    const app = appWithRefererGuard();
    const res = await app.request("/", {
      headers: { referer: "https://grida.co/desktopX/evil" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a malformed Referer", async () => {
    const app = appWithRefererGuard();
    const res = await app.request("/", {
      headers: { referer: "not a url" },
    });
    expect(res.status).toBe(403);
  });
});

describe("makeCorsMiddleware (GRIDA-SEC-004 browser belt-and-suspenders)", () => {
  function appWithCors(): Hono {
    const app = new Hono();
    app.use("*", makeCorsMiddleware(ACCESS));
    app.get("/", (c) => c.text("ok"));
    return app;
  }

  it("echoes Access-Control-Allow-Origin for an allowlisted origin", async () => {
    const app = appWithCors();
    const res = await app.request("/", {
      headers: { origin: "https://grida.co" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://grida.co"
    );
  });

  it("omits Access-Control-Allow-Origin for a non-allowlisted origin (no allowlist leak)", async () => {
    const app = appWithCors();
    const res = await app.request("/", {
      headers: { origin: "https://evil.example" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("never answers with a wildcard ACAO", async () => {
    const app = appWithCors();
    const res = await app.request("/", {
      headers: { origin: "https://grida.co" },
    });
    expect(res.headers.get("access-control-allow-origin")).not.toBe("*");
  });
});
