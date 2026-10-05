// Real source page/handler and fixed workload transport; external Auth/HTTP responses are fixtures.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountContinuation,
  accountPath,
  accountSignInPath,
  resolveAccountContinuation,
} from "./console-account";
const state = vi.hoisted(() => ({
  user: { id: "source-user", email: "alice@example.test" } as {
    id: string;
    email: string;
  } | null,
  userError: null as { name: string } | null,
  requestHeaders: {} as Record<string, string>,
  signOut:
    vi.fn<
      (options: {
        scope: "local";
      }) => Promise<{ error: null | { message: string } }>
    >(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.user },
        error: state.userError,
      }),
      signOut: state.signOut,
    },
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(state.requestHeaders),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("not_found");
  },
}));
vi.mock("next/link", () => ({
  default: ({ prefetch: _prefetch, ...props }: { prefetch?: boolean }) =>
    React.createElement("a", props),
}));
import AccountPage, { metadata } from "@/app/(site)/gateway/account/page";
import { changeAccount } from "@/app/(site)/gateway/account/actions";
import { resolve_next } from "@/host/url";

const continuation = "A".repeat(43),
  source = "https://grida.example.test",
  consoleOrigin = "https://console.example.test";
const destination = "/organizations/42/gateway/requests/req_test1234";
const resolved = {
  purpose: "switch",
  return_url: `${consoleOrigin}/auth/continue?continuation=${continuation}`,
  cancel_url: consoleOrigin + destination,
};
let transport: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.stubEnv("GRIDA_BILLING_OWNER", "infra");
  vi.stubEnv("GRIDA_PLATFORM_BILLING_ORIGIN", "https://platform.example.test");
  vi.stubEnv("GRIDA_PLATFORM_CONSOLE_ORIGIN", consoleOrigin);
  vi.stubEnv("GRIDA_OAUTH_ORIGIN", source);
  vi.stubEnv("GRIDA_PLATFORM_SSR_KEY_ID", "source-ssr");
  vi.stubEnv("GRIDA_PLATFORM_SSR_TOKEN", "w".repeat(43));
  state.user = { id: "source-user", email: "alice@example.test" };
  state.userError = null;
  state.requestHeaders = {
    origin: source,
    host: new URL(source).host,
    "sec-fetch-site": "same-origin",
  };
  state.signOut.mockReset().mockResolvedValue({ error: null });
  transport = vi.fn<typeof fetch>(async () => Response.json(resolved));
  vi.stubGlobal("fetch", transport);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("source account continuation", () => {
  it("resolves an opaque request without forwarding any user or browser authority", async () => {
    expect(await resolveAccountContinuation(continuation)).toEqual({
      returnURL: resolved.return_url,
      cancelURL: resolved.cancel_url,
    });
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe(
      "https://platform.example.test/platform/v1/continuations/resolve"
    );
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ continuation }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
      accept: "application/json",
      authorization: `Bearer ${"w".repeat(43)}`,
      "content-type": "application/json",
      "x-grida-workload-key-id": "source-ssr",
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(accountSignInPath(continuation)).toBe(
      "/sign-in?next=" + encodeURIComponent(source + accountPath(continuation))
    );
  });
  it.each(["https://grida.co", "https://grida.m4.grida.test:56851"])(
    "keeps the exact public account return when Auth receives an internal proxy origin: %s",
    (publicOrigin) => {
      vi.stubEnv("GRIDA_OAUTH_ORIGIN", publicOrigin);
      const signIn = new URL(accountSignInPath(continuation), publicOrigin);
      expect(signIn.pathname).toBe("/sign-in");
      expect(signIn.origin).toBe(publicOrigin);
      expect([...signIn.searchParams.keys()]).toEqual(["next"]);
      const next = signIn.searchParams.get("next");
      expect(next).toBe(publicOrigin + accountPath(continuation));
      // This is the existing source sign-in resolver that exposed localhost.
      expect(resolve_next("http://localhost:56841", next)).toBe(
        publicOrigin + accountPath(continuation)
      );
      expect(new URL(next!).searchParams.getAll("continuation")).toEqual([
        continuation,
      ]);
    }
  );
  it.each(["", "https://grida.co/path", "https://grida.co#fragment"])(
    "invalid public source configuration cannot fall back to an internal/browser host: %s",
    (origin) => {
      vi.stubEnv("GRIDA_OAUTH_ORIGIN", origin);
      expect(() => accountSignInPath(continuation)).toThrow(
        "Billing is unavailable."
      );
    }
  );
  it.each([
    {},
    { continuation: "x" },
    { continuation: "A".repeat(42) + "/" },
    { continuation: [continuation] },
    { continuation, next: "/" },
  ])(
    "rejects malformed/duplicate/extra inputs before any transport: %j",
    (input) => {
      expect(() => accountContinuation(input)).toThrow(
        "Billing is unavailable."
      );
      expect(transport).not.toHaveBeenCalled();
    }
  );
  it.each([
    { ...resolved, purpose: "login" },
    {
      ...resolved,
      return_url:
        "https://foreign.test/auth/continue?continuation=" + continuation,
    },
    { ...resolved, return_url: resolved.return_url + "&next=/" },
    {
      ...resolved,
      return_url: resolved.return_url.replace(continuation, "B".repeat(43)),
    },
    {
      ...resolved,
      cancel_url: "https://foreign.test/organizations/42/billing",
    },
    {
      ...resolved,
      cancel_url: consoleOrigin + "/organizations/42/gateway/keys?project_id=1",
    },
    { ...resolved, cancel_url: consoleOrigin + destination + "#fragment" },
    { ...resolved, cancel_url: consoleOrigin + "/auth/logout" },
    { ...resolved, extra: "ignored" },
  ])("rejects untrusted resolver navigation: %j", async (value) => {
    transport.mockImplementation(async () => Response.json(value));
    await expect(resolveAccountContinuation(continuation)).rejects.toThrow(
      "Billing is unavailable."
    );
    expect(state.signOut).not.toHaveBeenCalled();
  });
  it.each([401, 403, 500, 503])(
    "fails closed on resolver HTTP%s",
    async (status) => {
      transport.mockImplementation(
        async () => new Response("private upstream detail", { status })
      );
      await expect(resolveAccountContinuation(continuation)).rejects.toThrow(
        "Billing is unavailable."
      );
      expect(transport).toHaveBeenCalledTimes(1);
    }
  );
});

describe("actual account chooser page", () => {
  it("preserves native form Origin without sending the continuation in cross-origin referrers", () => {
    expect(metadata.referrer).toBe("same-origin");
  });
  it("shows verified source identity and only resolved return/cancel URLs without changing either session", async () => {
    const html = renderToStaticMarkup(
      await AccountPage({ searchParams: Promise.resolve({ continuation }) })
    );
    expect(html).toContain("Choose an account");
    expect(html).toContain("Continue as alice@example.test");
    expect(html).toContain(resolved.return_url);
    expect(html).toContain(resolved.cancel_url);
    expect(html).toContain("Use another account");
    expect(state.signOut).not.toHaveBeenCalled();
  });
  it("preserves the entire chooser continuation through existing source sign-in", async () => {
    state.user = null;
    const html = renderToStaticMarkup(
      await AccountPage({ searchParams: Promise.resolve({ continuation }) })
    );
    expect(html).toContain(accountSignInPath(continuation));
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Use another account");
    expect(html).toContain(resolved.cancel_url);
  });
  it("shows opaque unavailable state instead of using an unverified identity or invented navigation", async () => {
    state.userError = { name: "AuthRetryableFetchError" };
    const html = renderToStaticMarkup(
      await AccountPage({ searchParams: Promise.resolve({ continuation }) })
    );
    expect(html).toContain("Account switching is temporarily unavailable");
    expect(html).not.toContain("alice@example.test");
    expect(html).not.toContain(resolved.return_url);
  });
  it("expired requests do not sign out and require a new request", async () => {
    transport.mockImplementation(
      async () => new Response(null, { status: 401 })
    );
    const html = renderToStaticMarkup(
      await AccountPage({ searchParams: Promise.resolve({ continuation }) })
    );
    expect(html).toContain(
      "This request has expired or is no longer available"
    );
    expect(html).not.toContain("Use another account");
    expect(state.signOut).not.toHaveBeenCalled();
  });
  it("malformed route requests are not found before reading Auth or continuation state", async () => {
    await expect(
      AccountPage({
        searchParams: Promise.resolve({
          continuation: [continuation, continuation],
        }),
      })
    ).rejects.toThrow("not_found");
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("progressive source account change action", () => {
  it("revalidates the exact bound continuation, signs out locally, and redirects on the public source", async () => {
    const order: string[] = [];
    transport.mockImplementation(async () => {
      order.push("resolve");
      return Response.json(resolved);
    });
    state.signOut.mockImplementation(async () => {
      order.push("local sign-out");
      return { error: null };
    });
    await expect(
      changeAccount(continuation, { error: null }, new FormData())
    ).rejects.toThrow("redirect:" + source + accountSignInPath(continuation));
    expect(state.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(order).toEqual(["resolve", "local sign-out"]);
  });
  it.each<Record<string, string>>([
    { origin: "https://foreign.test" },
    { origin: "" },
    { origin: "null" },
    { origin: source + ",https://foreign.test" },
    { host: "foreign.test" },
    { host: "localhost:56841", "x-forwarded-host": "grida.example.test" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "" },
  ])(
    "rejects invalid raw request authority before resolving or signing out: %j",
    async (headers) => {
      Object.assign(state.requestHeaders, headers);
      await expect(
        changeAccount(continuation, { error: null }, new FormData())
      ).resolves.toEqual({
        error: "Unable to change accounts. Please try again.",
      });
      expect(state.signOut).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    }
  );
  it.each(["", "A".repeat(42), "A".repeat(44), "A".repeat(42) + "/"])(
    "revalidates malformed action-bound continuation: %s",
    async (token) => {
      await expect(
        changeAccount(token, { error: null }, new FormData())
      ).resolves.toEqual({
        error: "Unable to change accounts. Please try again.",
      });
      expect(state.signOut).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    }
  );
  it.each([401, 403, 503])(
    "resolver HTTP%s returns inline error state without logout",
    async (status) => {
      transport.mockImplementation(
        async () => new Response("private resolver detail", { status })
      );
      await expect(
        changeAccount(continuation, { error: null }, new FormData())
      ).resolves.toEqual({
        error: "Unable to change accounts. Please try again.",
      });
      expect(state.signOut).not.toHaveBeenCalled();
    }
  );
  it("local logout failure returns opaque inline state instead of redirecting", async () => {
    state.signOut.mockResolvedValue({
      error: { message: "private Auth details" },
    });
    await expect(
      changeAccount(continuation, { error: "caller state" }, new FormData())
    ).resolves.toEqual({
      error: "Unable to change accounts. Please try again.",
    });
    expect(state.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });
  it("submitted form fields cannot replace the bound continuation or public return", async () => {
    const form = new FormData();
    form.set("continuation", "B".repeat(43));
    form.set("next", "https://foreign.test/");
    await expect(
      changeAccount(continuation, { error: null }, form)
    ).rejects.toThrow("redirect:" + source + accountSignInPath(continuation));
    expect(transport.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ continuation })
    );
    expect(state.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });
});
