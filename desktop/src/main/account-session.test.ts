// GRIDA-SEC-005 — fixed-route account projection and confirmed sign-out pins.
import { describe, expect, it } from "vitest";
import { DesktopAccountSession } from "./account-session";

const signedInPayload = {
  user: {
    id: "user-1",
    email: "person@example.com",
    name: "Private Person",
    avatar_url: "https://example.com/private-avatar.png",
  },
};

describe("DesktopAccountSession.status", () => {
  it("reads only the fixed same-origin endpoint with fresh session cookies", async () => {
    const requests: RequestRecord[] = [];
    const session = createSession(requests, async () =>
      Response.json({ user: null })
    );

    await expect(session.status()).resolves.toBe("signed-out");
    expect(requests).toEqual([
      {
        url: "https://grida.co/desktop/auth/me",
        init: expect.objectContaining({
          method: "GET",
          credentials: "include",
          cache: "no-store",
          redirect: "manual",
          referrerPolicy: "no-referrer",
          headers: { accept: "application/json" },
        }),
      },
    ]);
    expect(requests[0]?.init).not.toHaveProperty("mode");
  });

  it("returns only signed-in and does not expose account PII", async () => {
    const session = createSession([], async () =>
      Response.json(signedInPayload)
    );

    const result = await session.status();
    expect(result).toBe("signed-in");
    expect(JSON.stringify(result)).not.toContain("person@example.com");
    expect(JSON.stringify(result)).not.toContain("Private Person");
    expect(JSON.stringify(result)).not.toContain("private-avatar");
  });

  it("tolerates additive hosted response fields", async () => {
    const session = createSession([], async () =>
      Response.json({
        ...signedInPayload,
        version: 2,
        user: { ...signedInPayload.user, plan: "future-field" },
      })
    );

    await expect(session.status()).resolves.toBe("signed-in");
  });

  it("treats a null user as signed-out", async () => {
    const session = createSession([], async () =>
      Response.json({ user: null })
    );

    await expect(session.status()).resolves.toBe("signed-out");
  });

  it.each([
    ["transport failure", async () => Promise.reject(new Error("offline"))],
    [
      "redirect",
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "/desktop/auth/sign-in" },
        }),
    ],
    [
      "followed redirect",
      async () => followedResponse(Response.json({ user: null })),
    ],
    [
      "non-success response",
      async () => Response.json({ user: null }, { status: 503 }),
    ],
    ["invalid JSON", async () => new Response("{")],
  ])("returns unavailable for a %s", async (_label, fetch) => {
    const session = createSession([], fetch);
    await expect(session.status()).resolves.toBe("unavailable");
  });

  it.each([
    null,
    [],
    {},
    { user: undefined },
    { user: false },
    { user: {} },
    { user: { ...signedInPayload.user, id: "" } },
  ])("returns unavailable for malformed schema %#", async (payload) => {
    const session = createSession([], async () => Response.json(payload));
    await expect(session.status()).resolves.toBe("unavailable");
  });
});

describe("DesktopAccountSession.signOut", () => {
  it("treats the fixed endpoint success as the cookie mutation authority", async () => {
    const requests: RequestRecord[] = [];
    const session = createSession(
      requests,
      async () => new Response(null, { status: 204 })
    );

    await expect(session.signOut()).resolves.toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      url: "https://grida.co/desktop/auth/sign-out",
      init: expect.objectContaining({
        method: "POST",
        credentials: "include",
        cache: "no-store",
        redirect: "manual",
        referrerPolicy: "no-referrer",
        headers: {
          accept: "application/json",
          "sec-grida-desktop-account-session": "sign-out",
        },
      }),
    });
    expect(requests[0]?.init).not.toHaveProperty("mode");
  });

  it.each([
    ["transport failure", async () => Promise.reject(new Error("offline"))],
    [
      "redirect",
      async () =>
        new Response(null, {
          status: 303,
          headers: { location: "/desktop/auth/sign-in" },
        }),
    ],
    [
      "followed redirect",
      async () => followedResponse(new Response(null, { status: 204 })),
    ],
    [
      "non-success response",
      async () => new Response("person@example.com", { status: 500 }),
    ],
  ])("rejects a %s without probing", async (_label, fetch) => {
    const requests: RequestRecord[] = [];
    const session = createSession(requests, fetch);

    const result = session.signOut();
    await expect(result).rejects.toThrow(
      "Grida account sign-out could not be completed"
    );
    await expect(result).rejects.not.toThrow("person@example.com");
    expect(requests).toHaveLength(1);
  });
});

describe("DesktopAccountSession construction", () => {
  it.each([
    "file:///tmp/editor",
    "data:text/plain,editor",
    "https://person:secret@grida.co",
  ])("rejects a non-web or credential-bearing editor URL: %s", (baseUrl) => {
    expect(
      () =>
        new DesktopAccountSession({
          base_url: baseUrl,
          fetch: async () => Response.json({ user: null }),
        })
    ).toThrow("invalid editor base URL");
  });
});

type RequestRecord = {
  url: string;
  init: RequestInit;
};

function createSession(
  requests: RequestRecord[],
  fetch: () => Promise<Response>,
  editorBaseUrl = "https://grida.co/some/configured/base"
): DesktopAccountSession {
  return new DesktopAccountSession({
    base_url: editorBaseUrl,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return await fetch();
    },
  });
}

function followedResponse(response: Response): Response {
  Object.defineProperty(response, "redirected", { value: true });
  return response;
}
