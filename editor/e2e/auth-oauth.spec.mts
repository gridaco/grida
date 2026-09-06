// GRIDA-SEC-010, GRIDA-SEC-011 — native authority proof within the owned local fixture.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { AuthClient } from "@grida/auth";
import { AccountClient } from "@grida/account";
import { createNativeAuth } from "@grida/auth/node";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { readState } from "../../scripts/auth-local/stack.mjs";

const web = "http://127.0.0.1:3041";
const api = "http://127.0.0.1:55431";
const callbacks = [
  "http://127.0.0.1:55435/callback",
  "http://127.0.0.1:55436/callback",
];
const allowedOrigins = new Set([
  web,
  api,
  ...callbacks.map((url) => new URL(url).origin),
]);
type User = { email: string; password: string };
type Outcome =
  | { ok: true; value: AuthClient.Status }
  | { ok: false; code: string };

function allowed(value: string, websocket = false) {
  const url = new URL(value);
  const origin = websocket ? url.origin.replace(/^ws:/, "http:") : url.origin;
  return (
    allowedOrigins.has(origin) && !url.username && !url.password && !url.hash
  );
}

function destination(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 180);
  } catch {
    return "invalid destination";
  }
}

async function phase(label: string, operation: () => Promise<void>) {
  console.info(`[oauth-proof] ${label}: start`);
  try {
    await test.step(label, operation, { timeout: 60_000 });
    console.info(`[oauth-proof] ${label}: passed`);
  } catch (error) {
    console.info(`[oauth-proof] ${label}: failed`);
    throw error;
  }
}

async function navigate(page: Page, url: string) {
  if (!allowed(url)) throw new Error("Browser destination escaped the fixture");
  let status: number | undefined;
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    status = response?.status();
    if (status !== undefined && status >= 400)
      throw new Error("HTTP navigation failure");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const category =
      status !== undefined
        ? `HTTP ${status}`
        : error instanceof Error && error.name === "TimeoutError"
          ? "timeout"
          : ([
              "net::ERR_ABORTED",
              "net::ERR_CONNECTION_REFUSED",
              "net::ERR_EMPTY_RESPONSE",
              "net::ERR_FAILED",
            ].find((code) => message.includes(code)) ?? "navigation error");
    throw new Error(
      `Fixture browser navigation failed (${category}); target=${destination(url)}, current=${destination(page.url())}`
    );
  }
}

function native(page: Page, config: AuthClient.Config) {
  let session: AuthClient.Session | null = null;
  let opened!: () => void;
  let failed!: (error: Error) => void;
  const auth = createNativeAuth(config, {
    custody: {
      async read() {
        return session;
      },
      async write(value) {
        session = value;
      },
      async clear() {
        session = null;
      },
    },
    async openBrowser(url) {
      try {
        await navigate(page, url);
        opened();
      } catch (error) {
        const safe =
          error instanceof Error &&
          error.message.startsWith("Fixture browser navigation failed")
            ? error
            : new Error("Fixture browser launch failed");
        failed(safe);
        throw safe;
      }
    },
  });
  return {
    auth,
    session: () => session,
    begin() {
      const navigation = new Promise<void>((resolve, reject) => {
        opened = resolve;
        failed = reject;
      });
      const result: Promise<Outcome> = auth.login().then(
        (value) => ({ ok: true, value }),
        (error) => ({
          ok: false,
          code: typeof error?.code === "string" ? error.code : "unexpected",
        })
      );
      return { navigation, result };
    },
  };
}

async function browserDecision(
  page: Page,
  user: User,
  decision: "Allow" | "Deny",
  consent: "required" | "reuse"
) {
  try {
    if (new URL(page.url()).pathname === "/insiders/auth/basic") {
      // Only the fixture's password UI. Never Google or Desktop's challenge flow.
      expect(await page.locator('input[name="challenge"]').inputValue()).toBe(
        ""
      );
      await page.getByLabel("Email", { exact: true }).fill(user.email);
      await page.getByLabel("Password", { exact: true }).fill(user.password);
      await page
        .getByRole("button", { name: "Login", exact: true })
        .click({ noWaitAfter: true });
      await page.waitForURL((url) => url.pathname === "/oauth/consent", {
        timeout: 30_000,
        waitUntil: "domcontentloaded",
      });
    }
    if (consent === "required") {
      await expect(page.getByTestId("oauth-consent")).toBeVisible();
      const decisionResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/private/oauth/decision" &&
          response.request().method() === "POST",
        { timeout: 15_000 }
      );
      await page
        .getByRole("button", { name: decision, exact: true })
        .click({ noWaitAfter: true });
      const response = await decisionResponse;
      if (response.status() !== 303) {
        throw new Error("Consent decision endpoint rejected the browser form");
      }
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(response.headers()["referrer-policy"]).toBe("no-referrer");
      // The native promise can settle before Chromium completes the 303's
      // callback navigation. Reusing this page sooner aborts the next login.
      await page.waitForURL(
        (url) => callbacks.includes(`${url.origin}${url.pathname}`),
        {
          timeout: 15_000,
          waitUntil: "domcontentloaded",
        }
      );
    } else {
      expect(
        callbacks.includes(
          `${new URL(page.url()).origin}${new URL(page.url()).pathname}`
        )
      ).toBe(true);
    }
  } catch {
    const rawAlert = await page
      .getByRole("alert")
      .first()
      .textContent({ timeout: 1_000 })
      .catch(() => null);
    const safeAlerts = new Set([
      "A valid account session is required.",
      "The authorization request is invalid.",
      "This authorization is invalid or has expired. Start sign-in again.",
      "This authorization is not permitted.",
      "OAuth access is not configured.",
      "The account service is unavailable. Try again.",
    ]);
    const alert =
      rawAlert && safeAlerts.has(rawAlert.trim())
        ? rawAlert.trim()
        : "no recognized auth alert";
    throw new Error(
      `Browser consent failed at ${destination(page.url())}: ${alert}`
    );
  }
}

async function login(
  client: ReturnType<typeof native>,
  page: Page,
  user: User,
  decision: "Allow" | "Deny" = "Allow",
  consent: "required" | "reuse" = "required"
) {
  const pending = client.begin();
  await pending.navigation;
  await browserDecision(page, user, decision, consent);
  return pending.result;
}

test("isolated OAuth: browser consent, native sessions, restart, permissions and revocation", async ({
  browser,
}) => {
  const state = await readState(process.env.GRIDA_AUTH_TEST_STATE!);
  expect(state.phase).toBe("bootstrapped");
  const setup = JSON.parse(await fs.readFile(state.setupPath, "utf8"));
  expect(setup.apiUrl).toBe(api);
  expect(setup.editorOrigin).toBe(web);
  expect(setup.publicClientPath).toBe(state.publicClientPath);
  const config: AuthClient.Config = JSON.parse(
    await fs.readFile(state.publicClientPath, "utf8")
  );
  expect(config.issuer).toBe(`${api}/auth/v1`);
  expect(config.apiOrigin).toBe(web);
  expect(config.redirectUris).toEqual(callbacks);
  const insider: User = setup.users.find(
    (user: User) => user.email === "insider@grida.co"
  );
  const alice: User = setup.users.find(
    (user: User) => user.email === "alice@acme.com"
  );
  if (!insider || !alice) throw new Error("Fixture seed users are missing");

  // Both native transport and explicit test requests are confined before any I/O.
  const originalFetch = globalThis.fetch;
  let tokenPosts = 0;
  let lastCodeExchange: string | null = null;
  globalThis.fetch = (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!allowed(url)) throw new Error("Node request escaped the fixture");
    if (new URL(url).pathname === "/auth/v1/oauth/token") {
      tokenPosts++;
      if (
        typeof init?.body === "string" &&
        new URLSearchParams(init.body).get("grant_type") ===
          "authorization_code"
      )
        lastCodeExchange = init.body;
    }
    return originalFetch(input, { ...init, redirect: "manual" });
  };
  const contexts: BrowserContext[] = [];
  const clients: ReturnType<typeof native>[] = [];
  let blockedBrowserRequest = false;
  let otherClientId: string | undefined;
  let probeRoot: string | undefined;
  let addedMembership:
    | { organizationId: number; userId: string; id?: number }
    | undefined;

  async function context() {
    const value = await browser.newContext({
      baseURL: web,
      serviceWorkers: "block",
    });
    value.setDefaultTimeout(15_000);
    value.setDefaultNavigationTimeout(30_000);
    contexts.push(value);
    value.on("response", async (response) => {
      const pathname = new URL(response.url()).pathname;
      if (
        response.status() < 400 ||
        ![
          "/private/oauth/decision",
          "/callback",
          "/insiders/auth/basic/sign-in",
        ].includes(pathname)
      )
        return;
      const location = response.headers()["location"];
      const target = location
        ? destination(new URL(location, response.url()).href)
        : "no redirect";
      let code = "none";
      if (response.headers()["content-type"]?.includes("application/json")) {
        const body = await response.json().catch(() => null);
        if (
          [
            "unauthorized",
            "invalid_request",
            "invalid_authorization",
            "forbidden",
            "not_configured",
            "auth_unavailable",
          ].includes(body?.error?.code)
        )
          code = body.error.code;
      }
      console.info(
        `[oauth-proof] failed ${pathname}: ${response.status()}, ${target}, error=${code}`
      );
    });
    await value.route("**/*", async (route) => {
      if (allowed(route.request().url())) await route.continue();
      else {
        blockedBrowserRequest = true;
        console.info(
          `[oauth-proof] blocked browser destination: ${destination(route.request().url())}`
        );
        await route.abort();
      }
    });
    await value.routeWebSocket("**/*", (socket) => {
      if (allowed(socket.url(), true)) socket.connectToServer();
      else {
        blockedBrowserRequest = true;
        console.info(
          `[oauth-proof] blocked browser socket: ${destination(socket.url())}`
        );
        socket.close();
      }
    });
    return value;
  }
  function client(page: Page) {
    const value = native(page, config);
    clients.push(value);
    return value;
  }
  async function request(
    route: string,
    options: {
      token?: string;
      admin?: boolean;
      method?: string;
      body?: unknown;
      form?: string;
      representation?: boolean;
    } = {}
  ) {
    const url = new URL(route, api);
    if (!allowed(url.href))
      throw new Error("Test API destination escaped the fixture");
    try {
      return await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          apikey: options.admin ? setup.serviceRoleKey : setup.anonKey,
          ...(options.representation
            ? { prefer: "return=representation" }
            : {}),
          ...(options.token
            ? { authorization: `Bearer ${options.token}` }
            : {}),
          ...(options.admin
            ? { authorization: `Bearer ${setup.serviceRoleKey}` }
            : {}),
          ...(options.form !== undefined
            ? { "content-type": "application/x-www-form-urlencoded" }
            : options.body !== undefined
              ? { "content-type": "application/json" }
              : {}),
        },
        ...(options.form !== undefined
          ? { body: options.form }
          : options.body !== undefined
            ? { body: JSON.stringify(options.body) }
            : {}),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("Local fixture API request failed");
    }
  }
  async function json(response: Response) {
    try {
      return await response.json();
    } catch {
      throw new Error("Fixture endpoint returned invalid JSON");
    }
  }
  function membershipRoute(value: NonNullable<typeof addedMembership>) {
    return `/rest/v1/organization_member?organization_id=eq.${value.organizationId}&user_id=eq.${value.userId}${value.id === undefined ? "" : `&id=eq.${value.id}`}`;
  }
  async function removeAddedMembership() {
    if (!addedMembership) return;
    const response = await request(membershipRoute(addedMembership), {
      admin: true,
      method: "DELETE",
    });
    if (response.status !== 204)
      throw new Error("Fixture membership cleanup failed");
    addedMembership = undefined;
  }
  async function password(user: User) {
    const response = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: user,
    });
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(typeof body.access_token === "string").toBe(true);
    return body.access_token as string;
  }
  async function revokeGrant(token: string) {
    const response = await request(
      `/auth/v1/user/oauth/grants?client_id=${encodeURIComponent(config.clientId)}`,
      { method: "DELETE", token }
    );
    expect([200, 204, 404].includes(response.status)).toBe(true);
  }
  async function accountStatus(token?: string) {
    const response = await request(`${web}/api/v1/auth/me`, { token });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    return response.status;
  }
  async function names(token: string) {
    const response = await request(
      "/rest/v1/organization?select=name&order=name",
      { token }
    );
    expect(response.status).toBe(200);
    return (await json(response)).map((item: { name: string }) => item.name);
  }
  async function rejected(auth: ReturnType<typeof createNativeAuth>) {
    const outcome = await auth.verify().then(
      () => "accepted",
      (error) => error?.code
    );
    expect(outcome).toBe("token_rejected");
  }

  try {
    const control = await password(insider);
    await revokeGrant(control);
    const insiderContext = await context();
    const page = await insiderContext.newPage();
    const first = client(page);

    await phase(
      "real insiders login, denial, then existing-browser approval",
      async () => {
        expect(await login(first, page, insider, "Deny")).toEqual({
          ok: false,
          code: "access_denied",
        });
        expect(await first.auth.status()).toEqual({ state: "signed-out" });
        const pending = first.begin();
        await pending.navigation;
        expect(new URL(page.url()).pathname).toBe("/oauth/consent");
        const response = await insiderContext.request.get(page.url(), {
          maxRedirects: 0,
        });
        expect(response.headers()["content-security-policy"]).toContain(
          "frame-ancestors 'none'"
        );
        expect(response.headers()["x-frame-options"]).toBe("DENY");
        // Next 16's development page renderer deliberately replaces configured
        // Cache-Control. Hosted HTML no-store remains a separate adoption gate.
        expect(response.headers()["cache-control"]).toBe(
          "no-cache, must-revalidate"
        );
        expect(response.headers()["referrer-policy"]).toBe("strict-origin");
        await browserDecision(page, insider, "Allow", "required");
        const result = await pending.result;
        expect(result.ok).toBe(true);
        expect((await first.auth.verify()).state).toBe("signed-in");
        expect(await accountStatus(first.session()!.accessToken)).toBe(200);
        expect(first.session()?.identity.email).toBe(insider.email);
        // Replaying the exact completed exchange must fail, even with its verifier.
        expect(lastCodeExchange !== null).toBe(true);
        const replay = await request("/auth/v1/oauth/token", {
          method: "POST",
          form: lastCodeExchange!,
        });
        expect(replay.status).toBe(400);
      }
    );

    const second = client(page);
    await phase(
      "reuse consent for a distinct native session; single-flight rotating refresh",
      async () => {
        expect((await login(second, page, insider, "Allow", "reuse")).ok).toBe(
          true
        );
        expect(
          first.session()?.accessToken !== second.session()?.accessToken
        ).toBe(true);
        const before = first.session()?.refreshToken;
        const count = tokenPosts;
        const one = first.auth.refresh();
        const two = first.auth.refresh();
        expect(one === two).toBe(true);
        expect((await one).state).toBe("signed-in");
        await two;
        expect(tokenPosts - count).toBe(1);
        expect(first.session()?.refreshToken !== before).toBe(true);
      }
    );

    await phase(
      "bearer endpoint rejects missing, malformed, password-session, GG and wrong-client credentials",
      async () => {
        expect(await accountStatus()).toBe(401);
        expect(await accountStatus("invalid-token")).toBe(401);
        expect(await accountStatus(control)).toBe(401);
        const fakeGg = [
          Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"),
          Buffer.from(
            JSON.stringify({
              aud: "grida-gateway",
              sub: first.session()!.identity.id,
              exp: Math.floor(Date.now() / 1000) + 60,
            })
          ).toString("base64url"),
          Buffer.alloc(32).toString("base64url"),
        ].join(".");
        expect(await accountStatus(fakeGg)).toBe(401);
        expect(
          (
            await insiderContext.request.get(`${web}/api/v1/auth/me`, {
              maxRedirects: 0,
            })
          ).status()
        ).toBe(401);

        const created = await request("/auth/v1/admin/oauth/clients", {
          admin: true,
          method: "POST",
          body: {
            client_name: "Rejected local test client",
            client_type: "public",
            token_endpoint_auth_method: "none",
            redirect_uris: callbacks,
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
          },
        });
        expect([200, 201].includes(created.status)).toBe(true);
        otherClientId = (await json(created)).client_id;
        expect(typeof otherClientId).toBe("string");
        const verifier = randomBytes(32).toString("base64url");
        const authorize = await request(
          `/auth/v1/oauth/authorize?${new URLSearchParams({
            client_id: otherClientId!,
            response_type: "code",
            redirect_uri: callbacks[0]!,
            scope: "email profile",
            state: randomBytes(32).toString("base64url"),
            code_challenge: createHash("sha256")
              .update(verifier)
              .digest("base64url"),
            code_challenge_method: "S256",
          })}`
        );
        expect([302, 303].includes(authorize.status)).toBe(true);
        const location = new URL(authorize.headers.get("location")!);
        expect(location.origin).toBe(web);
        const authorizationId = location.searchParams.get("authorization_id");
        expect(typeof authorizationId).toBe("string");
        const detail = await request(
          `/auth/v1/oauth/authorizations/${authorizationId}`,
          { token: control }
        );
        expect(detail.status).toBe(200);
        const consent = await request(
          `/auth/v1/oauth/authorizations/${authorizationId}/consent`,
          { method: "POST", token: control, body: { action: "approve" } }
        );
        expect(consent.status).toBe(200);
        const target = new URL((await json(consent)).redirect_url);
        expect(`${target.origin}${target.pathname}`).toBe(callbacks[0]);
        const exchanged = await request("/auth/v1/oauth/token", {
          method: "POST",
          form: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: otherClientId!,
            redirect_uri: callbacks[0]!,
            code_verifier: verifier,
            code: target.searchParams.get("code")!,
          }).toString(),
        });
        expect(exchanged.status).toBe(200);
        expect(await accountStatus((await json(exchanged)).access_token)).toBe(
          401
        );
      }
    );

    const alicePage = await (await context()).newPage();
    const aliceClient = client(alicePage);
    await phase(
      "OAuth tokens retain seeded organization RLS boundaries",
      async () => {
        await revokeGrant(await password(alice));
        expect((await login(aliceClient, alicePage, alice)).ok).toBe(true);
        expect(await names(first.session()!.accessToken)).toEqual(["local"]);
        expect(await names(aliceClient.session()!.accessToken)).toEqual([
          "acme",
        ]);
      }
    );

    await phase(
      "public native account requests observe two users and removed membership",
      async () => {
        const localPage = await first.auth.requestAccount("organizations.list");
        const acmePage =
          await aliceClient.auth.requestAccount("organizations.list");
        expect(localPage.organizations.map((value) => value.name)).toEqual([
          "local",
        ]);
        expect(acmePage.organizations.map((value) => value.name)).toEqual([
          "acme",
        ]);
        expect(localPage.next_cursor).toBeNull();
        expect(acmePage.next_cursor).toBeNull();
        const local = localPage.organizations[0]!;
        const acme = acmePage.organizations[0]!;
        const account = new AccountClient(first.auth);
        expect(await account.selectOrganization()).toEqual(local);
        expect(await account.selectOrganization({ name: local.name })).toEqual(
          local
        );
        expect((await account.credits({ id: local.id })).organization).toEqual(
          local
        );
        const localCredits = await first.auth.requestAccount("credits.read", {
          organization_id: local.id,
        });
        expect(localCredits).toMatchObject({
          organization: local,
          state: "not_provisioned",
          balance_cents: null,
        });
        await expect(
          aliceClient.auth.requestAccount("credits.read", {
            organization_id: local.id,
          })
        ).rejects.toMatchObject({ code: "forbidden" });
        expect(
          (
            await aliceClient.auth.requestAccount("credits.read", {
              organization_id: acme.id,
            })
          ).organization
        ).toEqual(acme);
        expect(
          await first.auth.requestAccount("organizations.list", {
            after: local.id,
          })
        ).toEqual({ organizations: [], next_cursor: null });
        const aliceStatus = await aliceClient.auth.status();
        if (aliceStatus.state === "signed-out")
          throw new Error("Alice native session is missing");
        const membership = {
          organizationId: local.id,
          userId: aliceStatus.identity.id,
        };
        const before = await request(membershipRoute(membership), {
          admin: true,
        });
        expect(before.status).toBe(200);
        expect(await json(before)).toEqual([]);
        // Only a new non-owner membership is mutable. Seeded owner rows remain intact.
        addedMembership = membership;
        const created = await request("/rest/v1/organization_member", {
          admin: true,
          method: "POST",
          representation: true,
          body: { organization_id: local.id, user_id: membership.userId },
        });
        expect(created.status).toBe(201);
        const inserted = await json(created);
        expect(Array.isArray(inserted) && inserted.length === 1).toBe(true);
        expect(Number.isSafeInteger(inserted[0].id) && inserted[0].id > 0).toBe(
          true
        );
        addedMembership.id = inserted[0].id;
        const aliceAccess = aliceClient.session()!.accessToken;
        expect(
          await aliceClient.auth.requestAccount("organizations.list")
        ).toEqual({
          organizations: [local, acme].sort(
            (left, right) => left.id - right.id
          ),
          next_cursor: null,
        });
        expect(
          await aliceClient.auth.requestAccount("credits.read", {
            organization_id: local.id,
          })
        ).toEqual(localCredits);
        await expect(
          new AccountClient(aliceClient.auth).credits()
        ).rejects.toMatchObject({
          code: "organization_required",
          choices_truncated: false,
        });
        expect(
          (
            await new AccountClient(aliceClient.auth).credits({
              name: local.name,
            })
          ).organization
        ).toEqual(local);
        await removeAddedMembership();
        await expect(
          aliceClient.auth.requestAccount("credits.read", {
            organization_id: local.id,
          })
        ).rejects.toMatchObject({ code: "forbidden" });
        expect(
          await aliceClient.auth.requestAccount("organizations.list")
        ).toEqual(acmePage);
        expect(await first.auth.requestAccount("organizations.list")).toEqual(
          localPage
        );
        // Membership visibility changes without a login or token replacement.
        expect(aliceClient.session()!.accessToken === aliceAccess).toBe(true);
      }
    );

    await phase(
      "native cached credits distinguish unobserved cache and zero without writes",
      async () => {
        const organization = (
          await first.auth.requestAccount("organizations.list")
        ).organizations[0]!;
        const id = organization.id;
        const accountSnapshot = async () => {
          const response = await request(
            "/rest/v1/rpc/fn_billing_get_metronome_account",
            { admin: true, method: "POST", body: { p_org: id } }
          );
          expect(response.status).toBe(200);
          return createHash("sha256")
            .update(JSON.stringify(await json(response)))
            .digest("hex");
        };
        const read = async () => {
          const before = await accountSnapshot();
          const result = await first.auth.requestAccount("credits.read", {
            organization_id: id,
          });
          expect(result.organization).toEqual(organization);
          expect(result.currency).toBe("USD");
          expect(result.source).toBe("cache");
          expect(await accountSnapshot()).toBe(before);
          return result;
        };
        expect(await read()).toMatchObject({
          account_present: true,
          state: "not_provisioned",
          balance_cents: null,
          cache_updated_at: null,
          billing_gate: { allowed: false, reason: "not_provisioned" },
        });
        // Existing fixture-only setup RPCs; no provider account or payment is created.
        const linked = await request(
          "/rest/v1/rpc/fn_billing_set_metronome_ids",
          {
            admin: true,
            method: "POST",
            body: {
              p_org: id,
              p_customer_id: "credits_local_customer",
              p_contract_id: "credits_local_contract",
            },
          }
        );
        expect(linked.status).toBe(204);
        expect(await read()).toMatchObject({
          state: "uncached",
          balance_cents: null,
          cache_updated_at: null,
          billing_gate: { allowed: false, reason: "below_floor" },
        });
        for (const [balance, entitled, reason] of [
          [0, false, "below_floor"],
          [24, true, "below_floor"],
          [25, false, "no_balance"],
          [25, true, null],
        ] as const) {
          const updated = await request(
            "/rest/v1/rpc/fn_billing_set_balance_cache",
            {
              admin: true,
              method: "POST",
              body: {
                p_org: id,
                p_balance_cents: balance,
                p_entitled: entitled,
              },
            }
          );
          expect(updated.status).toBe(204);
          const result = await read();
          expect(result).toMatchObject({
            state: "cached",
            balance_cents: balance,
            billing_gate: { allowed: reason === null, reason },
          });
          expect(typeof result.cache_updated_at).toBe("string");
        }
        const columns =
          "organization_id,organization_name,organization_display_name,account_present,credits_provisioned,cached_balance_cents,cached_balance_at,customer_entitled";
        const route = `/rest/v1/v_billing_credits?select=${columns}&organization_id=eq.${id}`;
        const own = await request(route, {
          token: first.session()!.accessToken,
        });
        expect(own.status).toBe(200);
        const rows = await json(own);
        expect(Array.isArray(rows) && rows.length === 1).toBe(true);
        expect(Object.keys(rows[0]).sort()).toEqual(columns.split(",").sort());
        const other = await request(route, {
          token: aliceClient.session()!.accessToken,
        });
        expect(other.status).toBe(200);
        expect(await json(other)).toEqual([]);
      }
    );

    await phase(
      "local logout revokes only the captured native session",
      async () => {
        const oldAccess = first.session()!.accessToken;
        expect(await first.auth.logout()).toEqual({
          state: "signed-out",
          revocation: "confirmed",
        });
        expect(await accountStatus(oldAccess)).toBe(401);
        expect((await second.auth.verify()).state).toBe("signed-in");
        const stillBrowser = client(page);
        expect(
          (await login(stillBrowser, page, insider, "Allow", "reuse")).ok
        ).toBe(true);
        await stillBrowser.auth.logout();
      }
    );

    await phase(
      "copied package works across subprocess restarts with disposable test custody",
      async () => {
        probeRoot = await fs.mkdtemp(path.join(state.root, "native-probe-"));
        await fs.chmod(probeRoot, 0o700);
        const packageRoot = path.join(probeRoot, "node_modules/@grida/auth");
        await fs.mkdir(packageRoot, { recursive: true, mode: 0o700 });
        await fs.cp(
          path.join(state.repoRoot, "packages/grida-auth/dist"),
          path.join(packageRoot, "dist"),
          { recursive: true }
        );
        await fs.copyFile(
          path.join(state.repoRoot, "packages/grida-auth/package.json"),
          path.join(packageRoot, "package.json")
        );
        const accountPackage = path.join(
          probeRoot,
          "node_modules/@grida/account"
        );
        await fs.mkdir(accountPackage, { recursive: true, mode: 0o700 });
        await fs.cp(
          path.join(state.repoRoot, "packages/grida-account/dist"),
          path.join(accountPackage, "dist"),
          { recursive: true }
        );
        await fs.copyFile(
          path.join(state.repoRoot, "packages/grida-account/package.json"),
          path.join(accountPackage, "package.json")
        );
        const script = path.join(probeRoot, "native-probe.mjs");
        await fs.copyFile(
          path.join(state.repoRoot, "scripts/auth-local/native-probe.mjs"),
          script
        );
        const configPath = path.join(probeRoot, "public-client.json");
        await fs.writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
        const sessionPath = path.join(probeRoot, "session.json");
        const probe = (operation: string, after?: number) =>
          new Promise<Record<string, unknown>>((resolve, reject) => {
            const child = spawn(
              process.execPath,
              [
                script,
                operation,
                configPath,
                sessionPath,
                ...(after === undefined ? [] : [String(after)]),
              ],
              {
                cwd: probeRoot,
                env: {
                  NODE_ENV: "test",
                  PATH: path.dirname(process.execPath),
                  HOME: probeRoot,
                  TMPDIR: probeRoot,
                  NO_PROXY: "127.0.0.1",
                },
                stdio: ["ignore", "ignore", "ignore", "ipc"],
              }
            );
            let result: Record<string, unknown> | undefined;
            const timer = setTimeout(() => child.kill("SIGKILL"), 45_000);
            child.on(
              "message",
              async (message: {
                type?: string;
                url?: string;
                result?: Record<string, unknown>;
              }) => {
                if (message.type === "browser") {
                  try {
                    await navigate(page, message.url!);
                    await browserDecision(page, insider, "Allow", "reuse");
                    if (child.connected) child.send({ type: "browser-opened" });
                  } catch {
                    if (child.connected) child.send({ type: "browser-failed" });
                  }
                } else if (message.type === "result") result = message.result;
              }
            );
            child.on("error", () => {
              clearTimeout(timer);
              reject(new Error("Standalone native probe failed to start"));
            });
            child.on("exit", (code) => {
              clearTimeout(timer);
              if (code === 0 && result) resolve(result);
              else reject(new Error("Standalone native probe failed"));
            });
          });
        expect((await probe("login")).state).toBe("signed-in");
        expect((await fs.stat(sessionPath)).mode & 0o777).toBe(0o600);
        const organizations =
          await second.auth.requestAccount("organizations.list");
        expect(await probe("organizations")).toEqual(organizations);
        const credits = await new AccountClient(second.auth).credits();
        expect(await probe("credits")).toEqual(credits);
        expect((await probe("restart")).state).toBe("signed-in");
        expect(await probe("organizations")).toEqual(organizations);
        expect(await probe("credits", credits.organization.id)).toEqual(
          credits
        );
        expect(
          await probe("organizations", organizations.organizations[0]!.id)
        ).toEqual({ organizations: [], next_cursor: null });
        expect(await probe("logout")).toEqual({
          state: "signed-out",
          revocation: "confirmed",
        });
        expect(
          await fs.access(sessionPath).then(
            () => true,
            () => false
          )
        ).toBe(false);
        expect((await second.auth.verify()).state).toBe("signed-in");
      }
    );

    await phase(
      "grant revocation rejects both application sessions while browser sign-in survives",
      async () => {
        const another = client(page);
        expect((await login(another, page, insider, "Allow", "reuse")).ok).toBe(
          true
        );
        await revokeGrant(control);
        await rejected(second.auth);
        await rejected(another.auth);
        expect(
          await second.auth.refresh().then(
            () => "accepted",
            (error) => error?.code
          )
        ).toBe("token_rejected");
        expect(
          await another.auth.refresh().then(
            () => "accepted",
            (error) => error?.code
          )
        ).toBe("token_rejected");
      }
    );

    await phase(
      "global logout rejects native and browser sessions for only that account",
      async () => {
        const globalOne = client(page);
        const one = globalOne.begin();
        await one.navigation;
        expect(new URL(page.url()).pathname).toBe("/oauth/consent");
        await browserDecision(page, insider, "Allow", "required");
        expect((await one.result).ok).toBe(true);
        const globalTwo = client(page);
        expect(
          (await login(globalTwo, page, insider, "Allow", "reuse")).ok
        ).toBe(true);
        const response = await request("/auth/v1/logout?scope=global", {
          method: "POST",
          token: control,
        });
        expect([200, 204].includes(response.status)).toBe(true);
        await rejected(globalOne.auth);
        await rejected(globalTwo.auth);
        expect((await aliceClient.auth.verify()).state).toBe("signed-in");
        const afterGlobal = client(page);
        const pending = afterGlobal.begin();
        await pending.navigation;
        expect(new URL(page.url()).pathname).toBe("/insiders/auth/basic");
        await afterGlobal.auth.cancelLogin();
        expect(await pending.result).toMatchObject({ ok: false });
      }
    );
    expect(blockedBrowserRequest).toBe(false);
  } finally {
    await removeAddedMembership().catch(() => {
      console.info(
        "[oauth-proof] owned membership cleanup failed; stop the disposable fixture"
      );
    });
    await Promise.allSettled(
      clients.map(async (value) => {
        await value.auth.cancelLogin();
        await value.auth.logout();
      })
    );
    if (otherClientId)
      await request(`/auth/v1/admin/oauth/clients/${otherClientId}`, {
        admin: true,
        method: "DELETE",
      }).catch(() => undefined);
    await Promise.allSettled(contexts.map((value) => value.close()));
    if (probeRoot) await fs.rm(probeRoot, { recursive: true, force: true });
    globalThis.fetch = originalFetch;
  }
});
