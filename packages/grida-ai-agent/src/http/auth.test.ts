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
import { makeBasicAuthGuard } from "./auth";

const PASSWORD = "test-password-256-bit-stand-in";

function appWithGuard(password: string): Hono {
  const app = new Hono();
  app.use("*", makeBasicAuthGuard(password));
  app.get("/", (c) => c.text("ok"));
  return app;
}

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
