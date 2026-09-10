// GRIDA-SEC-006, GRIDA-SEC-010, GRIDA-SEC-011 — native requests in disposable custody.
// GRIDA-GG: token — one-shot public handoff consumer; no persisted GG authority.
// Test-only subprocess host, copied beside a standalone package before execution.
// This deliberately limited file custody is not a product persistence contract.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createNativeAuth } from "@grida/auth/node";
import { AccountClient } from "@grida/account";

const [operation, configPath, sessionPath, after] = process.argv.slice(2);
assert(
  after === undefined ||
    (["organizations", "credits", "gg"].includes(operation) &&
      /^[1-9]\d*$/.test(after) &&
      Number.isSafeInteger(Number(after)))
);
const root = await fs.realpath(process.cwd());
assert.match(path.basename(root), /^native-probe-/);
assert.equal(path.dirname(configPath), root);
assert.equal(path.dirname(sessionPath), root);
assert.equal((await fs.stat(root)).mode & 0o777, 0o700);
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
assert.equal(config.issuer, "http://127.0.0.1:55431/auth/v1");
assert.equal(config.apiOrigin, "http://127.0.0.1:3041");
assert.match(config.publishableKey, /^sb_publishable_[A-Za-z0-9_-]+$/);
assert.deepEqual(config.redirectUris, [
  "http://127.0.0.1:55435/callback",
  "http://127.0.0.1:55436/callback",
]);

let rotatedLogoutTokens;
let logoutRefreshRequests = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  );
  assert(
    ["http://127.0.0.1:55431", "http://127.0.0.1:3041"].includes(url.origin),
    "Probe network escaped the fixture"
  );
  assert(!url.username && !url.password && !url.hash);
  const headers = new Headers(init?.headers);
  if (url.pathname === "/auth/v1/logout") {
    assert.equal(url.search, "?scope=local");
    // Local Kong also accepts a bearer without this key; enforce the hosted
    // admission contract explicitly so this proof cannot repeat that blind spot.
    assert(headers.get("apikey") === config.publishableKey);
    assert(headers.get("authorization")?.startsWith("Bearer "));
  } else {
    assert(headers.get("apikey") !== config.publishableKey);
  }
  if (
    operation === "logout-expired" &&
    url.pathname === "/auth/v1/oauth/token"
  ) {
    assert.equal(++logoutRefreshRequests, 1);
  }
  const response = await originalFetch(input, { ...init, redirect: "manual" });
  if (
    operation === "logout-expired" &&
    url.pathname === "/auth/v1/oauth/token" &&
    response.status === 200
  ) {
    assert.equal(rotatedLogoutTokens, undefined);
    const tokens = await response.clone().json();
    rotatedLogoutTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };
  }
  return response;
};

const custody = {
  async read() {
    try {
      const metadata = await fs.lstat(sessionPath);
      assert(metadata.isFile() && !metadata.isSymbolicLink());
      assert.equal(metadata.mode & 0o777, 0o600);
      return JSON.parse(await fs.readFile(sessionPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  },
  async write(value) {
    const temporary = `${sessionPath}.pending`;
    await fs.writeFile(temporary, JSON.stringify(value), {
      mode: 0o600,
      flag: "wx",
    });
    await fs.rename(temporary, sessionPath);
  },
  async clear() {
    await fs.rm(sessionPath, { force: true });
  },
};

let capturedLogoutSession;
if (["logout", "logout-expired"].includes(operation)) {
  capturedLogoutSession = await custody.read();
  assert(capturedLogoutSession);
  if (operation === "logout-expired") {
    // Advance only this isolated application's clock beyond its issued JWT.
    // GoTrue keeps its real clock; this proves detached renewal, not natural
    // issuer expiry. Leave time for the replacement JWT to have a later expiry.
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    const claims = JSON.parse(
      Buffer.from(
        capturedLogoutSession.accessToken.split(".")[1],
        "base64url"
      ).toString("utf8")
    );
    const now = Date.now;
    const offset =
      Math.max(capturedLogoutSession.expiresAt, claims.exp * 1000) + 1 - now();
    assert(Number.isSafeInteger(offset) && offset > 0 && offset <= 3_600_000);
    Date.now = () => now() + offset;
  }
}

let browserOpened;
let ggGrant;
const auth = createNativeAuth(config, {
  custody,
  gg: {
    accept(grant) {
      assert.equal(ggGrant, undefined);
      ggGrant = grant;
      return undefined;
    },
  },
  async openBrowser(url) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "http://127.0.0.1:55431");
    assert.equal(parsed.pathname, "/auth/v1/oauth/authorize");
    browserOpened = new Promise((resolve, reject) => {
      process.once("message", (message) =>
        message?.type === "browser-opened"
          ? resolve()
          : reject(new Error("Test browser launch failed"))
      );
      process.send({ type: "browser", url });
    });
    await browserOpened;
  },
});

try {
  let result;
  if (operation === "login") result = await auth.login();
  else if (operation === "restart") {
    assert.equal((await auth.status()).state, "signed-in");
    await auth.verify();
    result = await auth.refresh();
  } else if (operation === "organizations") {
    result = await new AccountClient(auth).organizations(
      after === undefined ? undefined : { after: Number(after) }
    );
  } else if (operation === "credits") {
    result = await new AccountClient(auth).credits(
      after === undefined ? undefined : { id: Number(after) }
    );
  } else if (operation === "gg") {
    const organization = await new AccountClient(auth).selectOrganization(
      after === undefined ? undefined : { id: Number(after) }
    );
    const before = await fs.readFile(sessionPath, "utf8");
    const access = await auth.requestGgAccess({
      organization_id: organization.id,
    });
    assert(ggGrant && Object.isFrozen(ggGrant));
    assert.deepEqual(Object.keys(access).sort(), [
      "expires_at",
      "organization",
    ]);
    assert.deepEqual(access.organization, {
      id: organization.id,
      name: organization.name,
    });
    try {
      const response = await fetch(`${config.apiOrigin}/api/v1/ai/models`, {
        headers: { authorization: `Bearer ${ggGrant.token}` },
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      assert.equal(response.status, 200);
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          assert(
            size <= 65_536,
            "GG model response exceeded the fixture bound"
          );
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const catalogue = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      assert.equal(catalogue.object, "list");
      assert(Array.isArray(catalogue.data) && catalogue.data.length > 0);
      assert(catalogue.data.every((model) => typeof model.id === "string"));
      const afterMint = await fs.readFile(sessionPath, "utf8");
      assert.equal(afterMint.includes(ggGrant.token), false);
      assert.equal(
        afterMint === before,
        true,
        "GG exchange changed test custody"
      );
      result = { ...access, model_count: catalogue.data.length };
    } finally {
      ggGrant = undefined;
    }
  } else if (["logout", "logout-expired"].includes(operation)) {
    result = await auth.logout();
    assert.deepEqual(result, { state: "signed-out", revocation: "confirmed" });
    assert.equal(await custody.read(), null);
    if (operation === "logout-expired") {
      assert.equal(logoutRefreshRequests, 1);
      assert(rotatedLogoutTokens);
      assert(
        rotatedLogoutTokens.refreshToken !== capturedLogoutSession.refreshToken
      );
    }
    for (const tokens of [capturedLogoutSession, rotatedLogoutTokens].filter(
      Boolean
    )) {
      const identity = await fetch(`${config.apiOrigin}/api/v1/auth/me`, {
        headers: { authorization: `Bearer ${tokens.accessToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      assert.equal(identity.status, 401);
      await identity.body?.cancel();
      // Use the underlying guarded destination directly so these negative probes
      // cannot be mistaken for the application's one detached renewal above.
      const refresh = await originalFetch(`${config.issuer}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: config.clientId,
          refresh_token: tokens.refreshToken,
        }).toString(),
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      assert([400, 401].includes(refresh.status));
      await refresh.body?.cancel();
    }
  } else throw new Error("Unknown probe operation");
  await browserOpened;
  process.send({ type: "result", result });
} catch {
  process.send({ type: "failed" });
  process.exitCode = 1;
} finally {
  ggGrant = undefined;
  capturedLogoutSession = undefined;
  rotatedLogoutTokens = undefined;
  process.disconnect();
}
