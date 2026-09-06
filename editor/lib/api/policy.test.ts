// GRIDA-SEC-012 — machine admission cannot invoke browser routing or grant identity.
import { describe, expect, it } from "vitest";
import { apiPolicy } from "./policy";
import { apiOperations } from "./operations";

const config = { GRIDA_API_ORIGIN: "http://127.0.0.1:3041" };
function request(
  path = "/api/v1/auth/me",
  host = "127.0.0.1:3041",
  method = "GET"
) {
  return new Request(`http://127.0.0.1:3041${path}`, {
    method,
    headers: { host },
  });
}

describe("machine API request policy", () => {
  it.each([
    "/api/v1",
    "/api/v1/",
    "/api/v1/auth/me",
    "/api/v1/missing",
    "/API/V1/auth/me",
    "/%61pi/v1/auth/me",
    "/%41pi/v1/auth/me",
    "/api%2fv1/auth/me",
    "/%61pi/v1/%ZZ",
  ])("owns %s", (path) => {
    expect(apiPolicy.matches(path)).toBe(true);
  });
  it.each(["/api/v10", "/api/v1-other", "/v1/auth/me", "/desktop/auth/me"])(
    "does not widen its prefix to %s",
    (path) => {
      expect(apiPolicy.matches(path)).toBe(false);
    }
  );
  it("admits each known operation without granting identity or changing its response policy", () => {
    for (const operation of Object.values(apiOperations.definitions)) {
      expect(apiPolicy.respond(request(operation.path), config)).toBeNull();
    }
  });
  it.each([
    "/api/v1",
    "/api/v1/auth/me/",
    "/api/v1/auth/connect",
    "/api/v1/missing",
    "/API/V1/auth/me",
    "/%61pi/v1/auth/me",
    "/api/v1%2fauth/me",
  ])("keeps unknown %s out of the web pipeline", async (path) => {
    const response = apiPolicy.respond(request(path), config)!;
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "API endpoint not found." },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("location")).toBe(false);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it.each([
    "tenant.grida.site",
    "tenant.localhost:3041",
    "unknown.example",
    "grida.co",
    "127.0.0.1:3042",
  ])("rejects unconfigured authority %s", (host) => {
    expect(apiPolicy.respond(request(undefined, host), config)?.status).toBe(
      404
    );
  });
  it("does not trust forwarded hosts or cookies", () => {
    const req = request(undefined, "attacker.example");
    req.headers.set("x-forwarded-host", "127.0.0.1:3041");
    req.headers.set("forwarded", "host=127.0.0.1:3041");
    req.headers.set("cookie", "fixture=synthetic");
    expect(apiPolicy.respond(req, config)?.status).toBe(404);
  });
  it("compares DNS case insensitively but refuses duplicate/missing hosts", () => {
    expect(
      apiPolicy.respond(request(undefined, "API.EXAMPLE"), {
        GRIDA_API_ORIGIN: "https://api.example",
      })
    ).toBeNull();
    const req = request();
    req.headers.delete("host");
    expect(apiPolicy.respond(req, config)?.status).toBe(404);
    req.headers.set("host", "127.0.0.1:3041, attacker.example");
    expect(apiPolicy.respond(req, config)?.status).toBe(404);
  });
  it.each([
    "",
    "https://api.example/",
    "https://api.example/path",
    "https://api.example?x=1",
    "https://user:secret@api.example",
    "http://api.example",
    "https://API.example",
  ])("fails closed for noncanonical origin %s", async (origin) => {
    const response = apiPolicy.respond(request(), {
      GRIDA_API_ORIGIN: origin,
    })!;
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("not_configured");
  });
  it("serves explicit API maintenance as an uncached machine failure", async () => {
    const response = apiPolicy.respond(request(), {
      ...config,
      GRIDA_API_MAINTENANCE: "1",
    })!;
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("temporarily_unavailable");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("location")).toBe(false);
    expect(
      apiPolicy.respond(request(), {
        ...config,
        GRIDA_API_MAINTENANCE: "false",
      })?.status
    ).toBe(503);
  });
  it("returns bodyless HEAD failures", async () => {
    const response = apiPolicy.respond(
      request("/api/v1/missing", undefined, "HEAD"),
      config
    )!;
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
  it("uses trusted app/deployment defaults without OAuth or billing configuration", () => {
    expect(
      apiPolicy.respond(request(undefined, "grida.co"), {
        NODE_ENV: "production",
      })
    ).toBeNull();
    expect(
      apiPolicy.respond(request(undefined, "app.example"), {
        NEXT_PUBLIC_URL: "app.example",
      })
    ).toBeNull();
    expect(
      apiPolicy.respond(request(undefined, "preview.example"), {
        VERCEL: "1",
        VERCEL_URL: "preview.example",
      })
    ).toBeNull();
    expect(
      apiPolicy.respond(request(undefined, "branch.example"), {
        VERCEL: "1",
        VERCEL_BRANCH_URL: "branch.example",
      })
    ).toBeNull();
    expect(
      apiPolicy.respond(request(undefined, "preview.example"), {
        VERCEL_URL: "preview.example",
      })?.status
    ).toBe(404);
  });
  it("limits automatic loopback defaults to local development and the configured port", () => {
    expect(
      apiPolicy.respond(request(undefined, "localhost:3000"), {
        NODE_ENV: "development",
      })
    ).toBeNull();
    expect(
      apiPolicy.respond(request(), { NODE_ENV: "development", PORT: "3041" })
    ).toBeNull();
    expect(
      apiPolicy.respond(request(), { NODE_ENV: "production", PORT: "3041" })
        ?.status
    ).toBe(404);
    expect(
      apiPolicy.respond(request(), { NODE_ENV: "development", PORT: "65536" })
        ?.status
    ).toBe(503);
  });
});
