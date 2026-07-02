/**
 * GRIDA-SEC-005 — insiders sign-in route, desktop branch.
 *
 * Pins the branch decision: password verification always runs first; the
 * desktop mint happens only for a valid challenge; without one the classic
 * web redirects are untouched; and the mint's redirect goes to the GoTrue
 * verify URL extracted from Mailpit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

const signInWithPassword =
  vi.fn<(creds: unknown) => Promise<{ error: { message: string } | null }>>();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword } }),
}));

import { POST } from "./route";

const ORIGIN = "http://grida.test";
const CHALLENGE = "NF4wmu64KqpZmRNAuYJrxnETLbuzRbtPSbXpoHggKaA";
const SUPABASE = "http://127.0.0.1:54321";
const VERIFY = `${SUPABASE}/auth/v1/verify?token=pkce_tok&type=magiclink&redirect_to=grida://auth/callback`;

function request(fields: Record<string, string>): NextRequest {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new Request(`${ORIGIN}/insiders/auth/basic/sign-in`, {
    method: "POST",
    body,
  }) as unknown as NextRequest;
}

/**
 * Fetch double for the desktop mint: 200 for the GoTrue /otp send, a
 * fresh Mailpit message list, and the message body carrying the verify
 * link.
 */
function stubMintFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/auth/v1/otp")) {
        return new Response("{}", { status: 200 });
      }
      if (url.includes("/api/v1/messages")) {
        return Response.json({
          messages: [
            {
              ID: "m1",
              Created: new Date().toISOString(),
              To: [{ Address: "insider@grida.co" }],
            },
          ],
        });
      }
      if (url.includes("/api/v1/message/m1")) {
        return Response.json({ Text: `link: ${VERIFY}`, HTML: "" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
}

beforeEach(() => {
  signInWithPassword.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /insiders/auth/basic/sign-in", () => {
  it("keeps the classic web redirect when no challenge is present", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const response = await POST(
      request({ email: "insider@grida.co", password: "password" })
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/insiders/welcome`);
  });

  it("rejects a wrong password before any desktop mint", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "invalid" } });
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await POST(
      request({
        email: "insider@grida.co",
        password: "wrong",
        challenge: CHALLENGE,
      })
    );
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores an invalid challenge and falls back to the web redirect", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await POST(
      request({
        email: "insider@grida.co",
        password: "password",
        challenge: "not-a-challenge!",
      })
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/insiders/welcome`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mints the desktop verify redirect for a valid challenge", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    stubMintFetch();
    const response = await POST(
      request({
        email: "insider@grida.co",
        password: "password",
        challenge: CHALLENGE,
      })
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(VERIFY);
  });
});
