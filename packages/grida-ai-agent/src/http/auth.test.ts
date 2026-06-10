/**
 * GRIDA-SEC-004 — contract pins for the Basic Auth guard (layer 3).
 *
 * The point of these tests is break-one-see-one-red: each case isolates a
 * single way the guard must reject (or accept), so a future refactor that
 * weakens the per-request password check fails exactly one assertion.
 */
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { AgentTransport } from "../transport";
import {
  AUTH_TOKEN_QUERY_PARAM,
  makeBasicAuthGuard,
  type BasicAuthGuardOptions,
} from "./auth";

const PASSWORD = "test-password-256-bit-stand-in";

function appWithGuard(password: string, options?: BasicAuthGuardOptions): Hono {
  const app = new Hono();
  app.use("*", makeBasicAuthGuard(password, options));
  app.get("/", (c) => c.text("ok"));
  app.get("/sessions/:id/status", (c) => c.text("stream ok"));
  app.post("/sessions/:id/status", (c) => c.text("posted"));
  return app;
}

const SSE_PATHS = [/^\/sessions\/[^/]+\/status$/];
const tokenQuery = (password: string) =>
  `?${AUTH_TOKEN_QUERY_PARAM}=${encodeURIComponent(
    AgentTransport.buildAuthToken(password)
  )}`;

describe("makeBasicAuthGuard (GRIDA-SEC-004 layer 3)", () => {
  it("accepts the exact per-spawn password", async () => {
    const app = appWithGuard(PASSWORD);
    const res = await app.request("/", {
      headers: { authorization: AgentTransport.buildBasicAuthHeader(PASSWORD) },
    });
    expect(res.status).toBe(200);
  });

  it("rejects a request with no Authorization header", async () => {
    const app = appWithGuard(PASSWORD);
    const res = await app.request("/");
    expect(res.status).toBe(401);
    // Challenge so a legitimate client knows to send credentials.
    expect(res.headers.get("www-authenticate")).toContain("Basic");
  });

  it("rejects a wrong password of the SAME length (real compare, not a length check)", async () => {
    const app = appWithGuard(PASSWORD);
    const wrong = "x".repeat(PASSWORD.length);
    expect(wrong.length).toBe(PASSWORD.length);
    const res = await app.request("/", {
      headers: { authorization: AgentTransport.buildBasicAuthHeader(wrong) },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong password of a DIFFERENT length (length-leak guard)", async () => {
    const app = appWithGuard(PASSWORD);
    const res = await app.request("/", {
      headers: { authorization: AgentTransport.buildBasicAuthHeader("short") },
    });
    expect(res.status).toBe(401);
  });

  it("rejects the correct password under a non-Basic scheme", async () => {
    const app = appWithGuard(PASSWORD);
    const res = await app.request("/", {
      headers: { authorization: `Bearer ${PASSWORD}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("auth_token query carriage (GRIDA-SEC-004, SSE routes only)", () => {
  it("accepts the credential as auth_token on an allowlisted GET path", async () => {
    const app = appWithGuard(PASSWORD, { query_token_paths: SSE_PATHS });
    const res = await app.request(
      `/sessions/ses_1/status${tokenQuery(PASSWORD)}`
    );
    expect(res.status).toBe(200);
  });

  it("rejects a wrong token on an allowlisted path", async () => {
    const app = appWithGuard(PASSWORD, { query_token_paths: SSE_PATHS });
    const res = await app.request(
      `/sessions/ses_1/status${tokenQuery("wrong-password")}`
    );
    expect(res.status).toBe(401);
  });

  it("never accepts the token on a non-allowlisted path", async () => {
    const app = appWithGuard(PASSWORD, { query_token_paths: SSE_PATHS });
    const res = await app.request(`/${tokenQuery(PASSWORD)}`);
    expect(res.status).toBe(401);
  });

  it("never accepts the token on a non-GET method", async () => {
    const app = appWithGuard(PASSWORD, { query_token_paths: SSE_PATHS });
    const res = await app.request(
      `/sessions/ses_1/status${tokenQuery(PASSWORD)}`,
      { method: "POST" }
    );
    expect(res.status).toBe(401);
  });

  it("a present-but-wrong header never falls back to a valid token", async () => {
    const app = appWithGuard(PASSWORD, { query_token_paths: SSE_PATHS });
    const res = await app.request(
      `/sessions/ses_1/status${tokenQuery(PASSWORD)}`,
      {
        headers: {
          authorization: AgentTransport.buildBasicAuthHeader("wrong"),
        },
      }
    );
    expect(res.status).toBe(401);
  });

  it("is disabled entirely by default (no query_token_paths)", async () => {
    const app = appWithGuard(PASSWORD);
    const res = await app.request(
      `/sessions/ses_1/status${tokenQuery(PASSWORD)}`
    );
    expect(res.status).toBe(401);
  });
});
