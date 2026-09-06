// GRIDA-SEC-010, GRIDA-SEC-011 — public native account requests in disposable custody.
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
    (["organizations", "credits"].includes(operation) &&
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
const auth = createNativeAuth(config, {
  custody,
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
  } else if (operation === "logout") result = await auth.logout();
  else throw new Error("Unknown probe operation");
  await browserOpened;
  process.send({ type: "result", result });
} catch {
  process.send({ type: "failed" });
  process.exitCode = 1;
} finally {
  process.disconnect();
}
