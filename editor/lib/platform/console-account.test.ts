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
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not_found");
  },
}));
vi.mock("next/link", () => ({
  default: ({ prefetch: _prefetch, ...props }: { prefetch?: boolean }) =>
    React.createElement("a", props),
}));
import AccountPage from "@/app/(site)/gateway/account/page";
import { POST } from "@/app/(site)/gateway/account/change/route";

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
  state.signOut.mockReset().mockResolvedValue({ error: null });
  transport = vi.fn<typeof fetch>(async () => Response.json(resolved));
  vi.stubGlobal("fetch", transport);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function request(
  body = new URLSearchParams({ continuation }).toString(),
  headers: Record<string, string> = {}
) {
  return new Request(source + "/gateway/account/change", {
    method: "POST",
    headers: {
      host: "grida.example.test",
      origin: source,
      "sec-fetch-site": "same-origin",
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body,
  });
}
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
      "/sign-in?next=" + encodeURIComponent(accountPath(continuation))
    );
  });
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

describe("source web account change", () => {
  it("revalidates the exact continuation then signs out only the current source session", async () => {
    const order: string[] = [];
    transport.mockImplementation(async () => {
      order.push("resolve");
      return Response.json(resolved);
    });
    state.signOut.mockImplementation(async (opts) => {
      order.push("local sign-out");
      return { error: null, opts };
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ready: true });
    expect(state.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(order).toEqual(["resolve", "local sign-out"]);
  });
  it.each<Record<string, string>>([
    { origin: "https://foreign.test" },
    { origin: "" },
    { host: "foreign.test" },
    { "sec-fetch-site": "cross-site" },
    { "content-type": "application/json" },
  ])(
    "rejects invalid form origin/type before sign-out: %j",
    async (headers) => {
      expect((await POST(request(undefined, headers))).status).toBe(403);
      expect(state.signOut).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    }
  );
  it.each([
    `continuation=${continuation}&continuation=${continuation}`,
    `continuation=${continuation}&return_to=/`,
    "continuation=" + "x".repeat(257),
    "continuation=x",
  ])(
    "rejects duplicated, additional and oversized form fields: %s",
    async (body) => {
      expect((await POST(request(body))).status).toBe(403);
      expect(state.signOut).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    }
  );
  it("an expired continuation cannot clear the source session", async () => {
    transport.mockImplementation(
      async () => new Response(null, { status: 401 })
    );
    expect((await POST(request())).status).toBe(403);
    expect(state.signOut).not.toHaveBeenCalled();
  });
  it("a failed local sign-out stays unavailable and never redirects as success", async () => {
    state.signOut.mockResolvedValue({
      error: { message: "private Auth details" },
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "account_change_unavailable",
    });
  });
});
