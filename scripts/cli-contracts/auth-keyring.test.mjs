// GRIDA-SEC-010 — native keytar compatibility with disposable fixture entries.
// Explicit integration gate: real OS custody; no existing entry is enumerated.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, realpath, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MacosKeychainFixture } from "./auth-macos.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
let macosFixture;

const require = createRequire(
  path.join(repository, "packages/grida-auth/package.json")
);
const keytarPath = require.resolve(
  process.env.GRIDA_AUTH_KEYTAR_MODULE || "@github/keytar"
);
const keytarBinding = require(keytarPath);
const keytar = Object.fromEntries(
  ["getPassword", "setPassword", "deletePassword"].map((operation) => [
    operation,
    async (...args) => {
      macosFixture?.prepare(args[0], args[1]);
      try {
        return await keytarBinding[operation](...args);
      } catch {
        // Keep the failed operation and async call site, never entry contents.
        throw new Error(`Native keytar ${operation} failed`);
      }
    },
  ])
);
let rustExecutable;
const config = {
  clientId: "synthetic-native-conformance",
  publishableKey: "sb_publishable_synthetic",
  issuer: "http://127.0.0.1:47901/auth/v1",
  apiOrigin: "http://127.0.0.1:47901",
  redirectUris: ["http://127.0.0.1:47902/callback"],
};
before(async () => {
  assert(
    ["darwin", "linux"].includes(process.platform),
    "native shared custody requires macOS or Linux"
  );
  assert(
    process.platform !== "darwin" ||
      process.env.GRIDA_AUTH_KEYRING_SMOKE === "1",
    "macOS keyring checks require explicit opt-in: GRIDA_AUTH_KEYRING_SMOKE=1. Only disposable entries are used; a locked keychain may request authorization."
  );
  macosFixture = MacosKeychainFixture.load();
  const built = spawnSync(
    "cargo",
    [
      "build",
      "-p",
      "grida-auth",
      "--features",
      "conformance",
      "--bin",
      "grida-auth-conformance",
      "--locked",
      "--message-format=json",
    ],
    { cwd: repository, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
  if (built.error) throw built.error;
  assert.equal(
    built.signal,
    null,
    "Auth conformance build terminated by signal"
  );
  assert.equal(built.status, 0, built.stderr);
  const executables = built.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter(
      (event) =>
        event.reason === "compiler-artifact" &&
        event.target?.name === "grida-auth-conformance" &&
        event.target.kind.includes("bin") &&
        typeof event.executable === "string"
    );
  assert.equal(executables.length, 1, "expected one built auth fixture driver");
  rustExecutable =
    process.env.GRIDA_AUTH_CONFORMANCE_BIN || executables[0].executable;
  macosFixture?.initialize(rustExecutable);
});
async function fixture(t) {
  const home = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-auth-keyring-"))
  );
  await writeFile(
    path.join(home, ".grida-auth-conformance"),
    "synthetic-fixture-only\n",
    { mode: 0o600 }
  );
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}
function driver(implementation, home, operation, extra = {}) {
  const service = extra.service || "Grida Native Auth";
  const account = extra.service
    ? "synthetic-fixture"
    : createHash("sha256")
        .update(
          JSON.stringify({
            home,
            issuer: config.issuer,
            clientId: config.clientId,
            apiOrigin: config.apiOrigin,
          })
        )
        .digest("hex");
  macosFixture?.prepare(service, account);
  const run = spawnSync(
    implementation === "ts" ? process.execPath : rustExecutable,
    implementation === "ts"
      ? ["--import", "tsx", "scripts/cli-contracts/auth-driver.mjs"]
      : [],
    {
      cwd: repository,
      env: { ...process.env, GRIDA_AUTH_KEYTAR_MODULE: keytarPath },
      input: JSON.stringify({ home, operation, config, ...extra }) + "\n",
      encoding: "utf8",
      // A native custody operation includes private-file validation and multiple
      // OS calls, which may require authorization. Keep a bounded integration
      // deadline without imposing the file-only process suite's 15-second cap.
      timeout: 60000,
      maxBuffer: 65536,
    }
  );
  assert.equal(
    run.status,
    0,
    `${implementation} ${operation}: native fixture driver failed (${run.error?.code || run.signal || "exit"})`
  );
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.result;
}
async function ownEntry(t, service, account, value) {
  assert(
    (await keytar.getPassword(service, account)) === null,
    "The disposable keyring identity must be absent before creation"
  );
  if (process.platform === "darwin") {
    // Synthetic values only. This tests native bytes and production custody,
    // not macOS application authorization. Allow local applications to access
    // this new disposable item; never replace an item or change global policy.
    const label = `Grida conformance fixture ${randomUUID()}`;
    const keychain = macosFixture ? [macosFixture.keychain] : [];
    let createdSuccessfully = false;
    t.after(async () => {
      // Also clean an ambiguous creation failure; 44 is errSecItemNotFound's
      // shell exit status. A confirmed creation still requires successful removal.
      macosFixture?.prepare(service, account);
      const removed = spawnSync(
        "/usr/bin/security",
        [
          "delete-generic-password",
          "-a",
          account,
          "-s",
          service,
          "-l",
          label,
          ...keychain,
        ],
        { encoding: "utf8", timeout: 60000, maxBuffer: 65536 }
      );
      if (!createdSuccessfully && removed.status === 44) return;
      assert.equal(
        removed.status,
        0,
        "Cannot remove the disposable macOS keyring fixture"
      );
      macosFixture?.forget(service, account);
      assert(
        (await keytar.getPassword(service, account)) === null,
        "The disposable keyring fixture must be absent after cleanup"
      );
    });
    const created = spawnSync(
      "/usr/bin/security",
      [
        "add-generic-password",
        "-a",
        account,
        "-s",
        service,
        "-l",
        label,
        "-A",
        "-w",
        value,
        ...keychain,
      ],
      { encoding: "utf8", timeout: 60000, maxBuffer: 65536 }
    );
    createdSuccessfully = created.status === 0;
    assert.equal(
      created.status,
      0,
      "Cannot create the disposable macOS keyring fixture"
    );
    macosFixture?.own(service, account, label);
    // Preserve a real keytar write before the native cross-language read.
    await keytar.setPassword(service, account, value);
    return;
  }
  // Only the process that creates the disposable item deletes it. Cross-app
  // deletion is not custody: shipped logout retains a revision tombstone.
  t.after(async () => {
    await keytar.deletePassword(service, account);
    assert(
      (await keytar.getPassword(service, account)) === null,
      "The disposable keyring fixture must be absent after cleanup"
    );
  });
  await keytar.setPassword(service, account, value);
}

test(
  "native keytar ↔ Rust exact service/account reads and replacement",
  { timeout: 120000 },
  async (t) => {
    const home = await fixture(t);
    const service = `Grida Rust CLI conformance ${randomUUID()}`;
    const account = "synthetic-fixture";
    assert(
      driver("rust", home, "keyring-read", { service }) === null,
      "The disposable keyring identity must be absent before creation"
    );
    await ownEntry(t, service, account, "synthetic-keytar-α-🙂");
    assert.equal(
      driver("rust", home, "keyring-read", { service }),
      "synthetic-keytar-α-🙂"
    );
    driver("rust", home, "keyring-write", {
      service,
      value: "synthetic-rust-β-🙂",
    });
    assert.equal(
      await keytar.getPassword(service, account),
      "synthetic-rust-β-🙂"
    );
    await keytar.setPassword(service, account, "synthetic-keytar-replaced");
    assert.equal(
      driver("rust", home, "keyring-read", { service }),
      "synthetic-keytar-replaced"
    );
  }
);

for (const [writer, clearer] of [
  ["ts", "ts"],
  ["ts", "rust"],
  ["rust", "ts"],
  ["rust", "rust"],
]) {
  test(
    `${writer} → ${clearer}: native custody logout retains a shared revision tombstone`,
    { timeout: 120000 },
    async (t) => {
      const home = await fixture(t);
      const binding = {
        home,
        issuer: config.issuer,
        clientId: config.clientId,
        apiOrigin: config.apiOrigin,
      };
      const account = createHash("sha256")
        .update(JSON.stringify(binding))
        .digest("hex");
      const service = "Grida Native Auth";
      await ownEntry(
        t,
        service,
        account,
        JSON.stringify({
          version: 1,
          binding,
          revision: randomUUID(),
          session: null,
        })
      );
      const call = (implementation, operation, extra = {}) =>
        driver(implementation, home, operation, {
          storage: "keyring",
          ...extra,
        });
      const session = {
        issuer: config.issuer,
        clientId: config.clientId,
        apiOrigin: config.apiOrigin,
        accessToken: "synthetic-native-access-α-🙂",
        refreshToken: "synthetic-native-refresh-β-🙂",
        expiresAt: Date.now() + 3600000,
        identity: {
          id: "synthetic-user",
          email: null,
          display_name: "Synthetic",
        },
      };
      const seeded = call(writer, "seed", { session });
      assert.deepEqual(call(clearer, "snapshot"), seeded);
      const record = async () =>
        JSON.parse(await keytar.getPassword(service, account));
      assert.deepEqual(await record(), { version: 1, binding, ...seeded });
      assert.deepEqual(call(clearer, "logout"), {
        state: "signed-out",
        revocation: "unconfirmed",
      });
      const cleared = call(writer, "snapshot");
      assert.equal(cleared.session, null);
      assert.notEqual(cleared.revision, seeded.revision);
      assert.match(
        cleared.revision,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      assert.deepEqual(await record(), { version: 1, binding, ...cleared });
      assert.deepEqual(call(writer, "logout"), {
        state: "signed-out",
        revocation: "not-needed",
      });
      const empty = call(clearer, "snapshot");
      assert.equal(empty.session, null);
      assert.notEqual(empty.revision, cleared.revision);
      assert.deepEqual(await record(), { version: 1, binding, ...empty });
      const metadata = JSON.parse(
        await readFile(
          path.join(home, "auth", account, "credentials.json"),
          "utf8"
        )
      );
      assert.deepEqual(metadata, {
        version: 1,
        binding,
        backend: "keyring",
        initialized: true,
      });
    }
  );
}
