// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-SEC-015 — separate signing, audience and lifetime prevent credential substitution.
// GRIDA-GG: token — policy runs only against explicit host capabilities.
import { describe, expect, it, vi } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { GgTokens } from "./tokens";

const KEY = new TextEncoder().encode(
  "synthetic-key-0123456789abcdef0123456789abcdef"
);
const NEXT_KEY = new TextEncoder().encode(
  "next-synthetic-key-0123456789abcdef0123456789abcdef"
);

describe("GgTokens host capabilities", () => {
  it("uses the injected clock for both mint and verification including 60-second tolerance", async () => {
    let now = Date.UTC(2025, 0, 1);
    const allowMint = vi.fn<(userId: string) => Promise<boolean>>(
      async () => true
    );
    const tokens = new GgTokens({
      now: () => now,
      allowMint,
      signing: () => ({ current: KEY, previous: null }),
    });
    const grant = await tokens.mint(
      { id: "user-1" },
      { organization: async () => ({ id: 7, name: "studio" }) }
    );
    expect(grant.expires_at).toBe("2025-01-01T00:15:00.000Z");
    const request = new Request("https://grida.test", {
      headers: { authorization: `Bearer ${grant.token}` },
    });
    now += 930_000;
    await expect(tokens.verify(request)).resolves.toMatchObject({
      sub: "user-1",
      org: 7,
    });
    now += 31_000;
    await expect(tokens.verify(request)).rejects.toMatchObject({
      code: "token_expired",
    });
    expect(allowMint).toHaveBeenCalledExactlyOnceWith("user-1");
  });

  it("uses only the current key to sign and classifies previous-key expiry", async () => {
    let now = Date.UTC(2025, 0, 1);
    let current = KEY;
    let previous: Uint8Array | null = null;
    const tokens = new GgTokens({
      now: () => now,
      allowMint: async () => true,
      signing: () => ({ current, previous }),
    });
    const first = await tokens.sign("user-1", 7);
    current = NEXT_KEY;
    previous = KEY;
    const second = await tokens.sign("user-1", 7);
    const options = { audience: "gg:ai", currentDate: new Date(now) };
    await expect(
      jwtVerify(second.token, NEXT_KEY, options)
    ).resolves.toHaveProperty("payload.org", 7);
    await expect(jwtVerify(second.token, KEY, options)).rejects.toBeDefined();
    const request = new Request("https://grida.test", {
      headers: { authorization: `Bearer ${first.token}` },
    });
    await expect(tokens.verify(request)).resolves.toHaveProperty("org", 7);
    now += 961_000;
    await expect(tokens.verify(request)).rejects.toMatchObject({
      code: "token_expired",
    });
  });

  it.each([
    ["missing iat", undefined, 900],
    ["missing exp", 0, undefined],
    ["fractional iat", 0.5, 900],
    ["fractional exp", 0, 899.5],
    ["zero window", 10, 10],
    ["negative window", 10, 9],
    ["oversized window", 0, 901],
    ["future issuance", 61, 961],
  ])("rejects a signed %s envelope", async (_name, issued, expires) => {
    const now = Date.UTC(2025, 0, 1);
    const seconds = now / 1000;
    const tokens = new GgTokens({
      now: () => now,
      allowMint: async () => true,
      signing: () => ({ current: KEY, previous: null }),
    });
    const token = await new SignJWT({
      sub: "user-1",
      org: 7,
      aud: "gg:ai",
      iat: issued === undefined ? undefined : seconds + Number(issued),
      exp: expires === undefined ? undefined : seconds + Number(expires),
    })
      .setProtectedHeader({ alg: "HS256" })
      .sign(KEY);
    await expect(
      tokens.verify(
        new Request("https://grida.test", {
          headers: { authorization: `Bearer ${token}` },
        })
      )
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("accepts issuance exactly inside the existing 60-second clock tolerance", async () => {
    const now = Date.UTC(2025, 0, 1);
    const tokens = new GgTokens({
      now: () => now,
      allowMint: async () => true,
      signing: () => ({ current: KEY, previous: null }),
    });
    const token = await new SignJWT({ org: 7 })
      .setSubject("user-1")
      .setAudience("gg:ai")
      .setIssuedAt(now / 1000 + 60)
      .setExpirationTime(now / 1000 + 960)
      .setProtectedHeader({ alg: "HS256" })
      .sign(KEY);
    await expect(
      tokens.verify(
        new Request("https://grida.test", {
          headers: { authorization: `Bearer ${token}` },
        })
      )
    ).resolves.toMatchObject({ org: 7 });
  });
});
