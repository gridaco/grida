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
assert.deepEqual(config.redirectUris, [
  "http://127.0.0.1:55435/callback",
  "http://127.0.0.1:55436/callback",
]);

const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
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
  return originalFetch(input, { ...init, redirect: "manual" });
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
  } else if (operation === "logout") result = await auth.logout();
  else throw new Error("Unknown probe operation");
  await browserOpened;
  process.send({ type: "result", result });
} catch {
  process.send({ type: "failed" });
  process.exitCode = 1;
} finally {
  ggGrant = undefined;
  process.disconnect();
}
