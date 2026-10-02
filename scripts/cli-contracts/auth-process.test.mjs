// GRIDA-SEC-010 / GRIDA-SEC-014 — real mixed-language custody, synthetic transport.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtemp,
  realpath,
  writeFile,
  readFile,
  rm,
  stat,
  mkdir,
} from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const custodyV1 = JSON.parse(
  await readFile(
    new URL(
      "../../packages/grida-auth/fixtures/account-v1/custody.json",
      import.meta.url
    ),
    "utf8"
  )
);

const config = {
  clientId: "synthetic-conformance",
  publishableKey: "sb_publishable_synthetic",
  issuer: "http://127.0.0.1:47901/auth/v1",
  apiOrigin: "http://127.0.0.1:47901",
  redirectUris: ["http://127.0.0.1:47902/callback"],
};
const identity = {
  id: "synthetic-user",
  email: null,
  display_name: "Synthetic",
};
const session = () => ({
  issuer: config.issuer,
  clientId: config.clientId,
  apiOrigin: config.apiOrigin,
  accessToken: "synthetic-access-old",
  refreshToken: "synthetic-refresh-old",
  expiresAt: Date.now() - 1000,
  identity,
});
const pairs = [
  ["ts", "ts"],
  ["ts", "rust"],
  ["rust", "ts"],
  ["rust", "rust"],
];
let rustExecutable;
before(async () => {
  const build = spawnSync(
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
  if (build.error) throw build.error;
  assert.equal(build.status, 0, build.stderr);
  rustExecutable = build.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find(
      (message) =>
        message.reason === "compiler-artifact" &&
        message.target.name === "grida-auth-conformance" &&
        message.target.kind.includes("bin") &&
        message.executable
    )?.executable;
  assert(
    rustExecutable,
    "Cargo did not report the auth conformance executable"
  );
});
async function fixture(t) {
  const home = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-auth-mixed-"))
  );
  await writeFile(
    path.join(home, ".grida-auth-conformance"),
    "synthetic-fixture-only\n",
    { mode: 0o600 }
  );
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}
function worker(t, implementation, home, operation, extra = {}) {
  const child =
    implementation === "ts"
      ? spawn(
          process.execPath,
          ["--import", "tsx", "scripts/cli-contracts/auth-driver.mjs"],
          {
            cwd: repository,
            stdio: ["pipe", "pipe", "pipe"],
            env: { PATH: process.env.PATH, HOME: home, TMPDIR: home },
          }
        )
      : spawn(rustExecutable, [], {
          cwd: repository,
          stdio: ["pipe", "pipe", "pipe"],
          env: { PATH: process.env.PATH, HOME: home, TMPDIR: home },
        });
  const messages = [];
  const waiters = [];
  let diagnostics = "";
  let done = false;
  const exited = once(child, "exit");
  child.stderr.on("data", (chunk) => {
    diagnostics += chunk;
    assert(diagnostics.length < 65536);
  });
  createInterface({ input: child.stdout }).on("line", (line) => {
    assert(line.length <= 1_048_576);
    const value = JSON.parse(line);
    if (waiters.length) waiters.shift().resolve(value);
    else messages.push(value);
  });
  child.on("exit", () => {
    done = true;
    for (const waiter of waiters.splice(0))
      waiter.reject(Error(`driver exited: ${diagnostics}`));
  });
  child.on("error", (error) => {
    for (const waiter of waiters.splice(0)) waiter.reject(error);
  });
  const send = (value) => child.stdin.write(JSON.stringify(value) + "\n");
  const next = async () => {
    if (messages.length) return messages.shift();
    if (done) throw Error(`driver exited: ${diagnostics}`);
    let timer;
    return Promise.race([
      new Promise((resolve, reject) => waiters.push({ resolve, reject })),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error(`driver deadline: ${diagnostics}`)),
          15000
        );
      }),
    ]).finally(() => clearTimeout(timer));
  };
  t.after(async () => {
    if (!done) child.kill("SIGKILL");
    await exited;
  });
  send({ home, operation, config, ...extra });
  return { child, next, send, messages, exited };
}
async function result(t, implementation, home, operation, extra) {
  const job = worker(t, implementation, home, operation, extra);
  const output = await job.next();
  assert.equal(output.ok, true, JSON.stringify(output));
  await job.exited;
  return output.result;
}
async function exchange(job, previous, next) {
  const request = await job.next();
  assert.equal(request.event, "request");
  assert(request.request.url.endsWith("/oauth/token"));
  assert.equal(
    new URLSearchParams(request.request.body).get("refresh_token"),
    previous
  );
  job.send({
    status: 200,
    body: {
      token_type: "Bearer",
      access_token: `synthetic-access-${next}`,
      refresh_token: `synthetic-refresh-${next}`,
      expires_in: 3600,
    },
  });
  const me = await job.next();
  assert(me.request.url.endsWith("/api/v1/auth/me"));
  assert.equal(
    me.request.headers.authorization,
    `Bearer synthetic-access-${next}`
  );
  return me;
}

for (const implementation of ["ts", "rust"]) {
  test(`${implementation}: reads the frozen CLI 0.2.0 account file without losing its revision`, async (t) => {
    assert.equal(
      createHash("sha256").update(custodyV1.binding_preimage).digest("hex"),
      custodyV1.profile_sha256
    );
    assert.equal(
      JSON.stringify(custodyV1.file_metadata.binding),
      custodyV1.binding_preimage
    );
    const home = await fixture(t);
    const metadata = structuredClone(custodyV1.file_metadata);
    metadata.binding.home = home;
    const profile = createHash("sha256")
      .update(JSON.stringify(metadata.binding))
      .digest("hex");
    const directory = path.join(home, "auth", profile);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = path.join(directory, "credentials.json");
    await writeFile(filename, JSON.stringify(metadata), { mode: 0o600 });
    assert.deepEqual(
      await result(t, implementation, home, "snapshot"),
      metadata.envelope
    );
    assert.deepEqual(await result(t, implementation, home, "storage-info"), {
      backend: "file",
      profile,
      initialized: true,
      migration: null,
    });
    const bytes = await readFile(filename, "utf8");
    assert.deepEqual(JSON.parse(bytes), metadata);
    await result(t, implementation, home, "logout");
    const cleared = await result(t, implementation, home, "snapshot");
    assert.equal(cleared.session, null);
    assert.notEqual(cleared.revision, metadata.envelope.revision);
    assert(!String(await readFile(filename)).includes("synthetic-access"));
  });
}

for (const [first, second] of pairs) {
  test(
    `${first} → ${second}: provider write/read preserves exact bytes and unrelated keys`,
    { timeout: 30000 },
    async (t) => {
      const home = await fixture(t);
      const key = '  synthetic-"-\\-α-🙂  ';
      await result(t, first, home, "provider-set", {
        provider: "example",
        key,
      });
      assert.equal(
        await result(t, second, home, "provider-read", { provider: "example" }),
        key
      );
      await result(t, second, home, "provider-set", {
        provider: "other",
        key: "synthetic-other",
      });
      assert.deepEqual(await result(t, first, home, "provider-list"), [
        { provider: "example" },
        { provider: "other" },
      ]);
    }
  );
  test(
    `${first} → ${second}: live SQLite lock survives waiters and releases on SIGKILL`,
    { timeout: 30000 },
    async (t) => {
      const home = await fixture(t);
      const holder = worker(t, first, home, "lock");
      assert.equal((await holder.next()).event, "locked");
      const lock = path.join(home, "providers/profile.lock.sqlite");
      const before = await stat(lock);
      const waiting = worker(t, second, home, "provider-set", {
        provider: "example",
        key: "synthetic",
      });
      await delay(200);
      assert.equal(waiting.messages.length, 0);
      holder.child.kill("SIGKILL");
      await holder.exited;
      assert.equal((await waiting.next()).ok, true);
      const after = await stat(lock);
      assert.equal(after.ino, before.ino);
      assert.equal(after.size, 0);
    }
  );
  test(
    `${first} → ${second}: rotating refresh is serialized through persisted identity`,
    { timeout: 30000 },
    async (t) => {
      const home = await fixture(t);
      await result(t, first, home, "seed", { session: session() });
      const rotating = worker(t, first, home, "refresh");
      await exchange(rotating, "synthetic-refresh-old", "one");
      const waiting = worker(t, second, home, "refresh");
      await delay(200);
      assert.equal(waiting.messages.length, 0);
      rotating.send({ status: 200, body: identity });
      assert.equal((await rotating.next()).ok, true);
      await exchange(waiting, "synthetic-refresh-one", "two");
      waiting.send({ status: 200, body: identity });
      assert.equal((await waiting.next()).ok, true);
      const snapshot = await result(t, first, home, "snapshot");
      assert.equal(snapshot.session.refreshToken, "synthetic-refresh-two");
      assert.equal(snapshot.session.identity.id, identity.id);
    }
  );
  test(
    `${first} → ${second}: accepted rotation remains durable after identity failure`,
    { timeout: 30000 },
    async (t) => {
      const home = await fixture(t);
      await result(t, first, home, "seed", { session: session() });
      const rotating = worker(t, first, home, "refresh");
      await exchange(rotating, "synthetic-refresh-old", "one");
      rotating.send({ status: 503, body: null });
      assert.equal((await rotating.next()).code, "unavailable");
      const snapshot = await result(t, second, home, "snapshot");
      assert.equal(snapshot.session.refreshToken, "synthetic-refresh-one");
      assert.equal(snapshot.session.accessToken, "synthetic-access-old");
      const logout = await result(t, second, home, "logout");
      assert.equal(logout.revocation, "unconfirmed");
      assert.deepEqual(await result(t, first, home, "status"), {
        state: "signed-out",
      });
    }
  );
  test(
    `${first} → ${second}: killed pending import resumes retirement without rereading`,
    { timeout: 30000 },
    async (t) => {
      const home = await fixture(t);
      await result(t, second, home, "provider-remove", { provider: "deleted" });
      const importing = worker(t, first, home, "provider-migrate", {
        entries: [
          ["deleted", "synthetic-stale"],
          ["example", "synthetic-import"],
        ],
      });
      assert.equal((await importing.next()).event, "source-read");
      assert.equal((await importing.next()).event, "retire");
      importing.child.kill("SIGKILL");
      await importing.exited;
      const blocked = worker(t, second, home, "provider-list");
      assert.equal((await blocked.next()).code, "migration_pending");
      const resume = worker(t, second, home, "provider-migrate", {
        entries: [["unexpected", "synthetic-not-imported"]],
      });
      assert.equal((await resume.next()).event, "retire");
      resume.send({ ok: true });
      assert.equal((await resume.next()).ok, true);
      assert.deepEqual(await result(t, first, home, "provider-list"), [
        { provider: "example" },
      ]);
      const persisted = await readFile(
        path.join(home, "providers/credentials.toml"),
        "utf8"
      );
      assert(!persisted.includes("synthetic-stale"));
    }
  );
}
