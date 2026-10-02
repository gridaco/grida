#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { readState } from "../auth-local/stack.mjs";
import { guards } from "../auth-local/guards.mjs";
import { sources } from "./sources.mjs";
import { createProviders } from "./providers.mjs";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(scripts, "../..");
const require = createRequire(path.join(repository, "editor/package.json"));
const next = require.resolve("next/dist/bin/next");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const children = new Set();

async function put(filename, text) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  await writeFile(filename, text, { mode: 0o600 });
}

function launch(binary, args, { cwd, env, input } = {}) {
  const child = spawn(binary, args, {
    cwd,
    env,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(input);
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      output = (output + chunk).slice(-2 * 1024 * 1024);
    });
  }
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const kill = (signal) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  const running = {
    child,
    done,
    log: () => guards.redact(output),
    async wait(timeout = 180_000) {
      const result = await Promise.race([
        done,
        delay(timeout, undefined, { ref: false }).then(() => {
          throw new Error("Owned child exceeded deadline");
        }),
      ]);
      assert.equal(
        result.code,
        0,
        `Owned ${path.basename(binary)} process failed`
      );
      return output;
    },
    async stop() {
      kill("SIGTERM");
      if (
        !(await Promise.race([
          done.then(() => true),
          delay(5000, false, { ref: false }),
        ]))
      ) {
        kill("SIGKILL");
        await done;
      }
      children.delete(running);
    },
  };
  children.add(running);
  return running;
}

async function snapshot(workspace) {
  const hashes = [];
  for (const relative of [
    ...sources,
    "editor/package.json",
    "editor/tsconfig.json",
  ]) {
    const source = path.join(repository, relative);
    const destination = path.join(
      workspace,
      relative === "editor/next.config.ts"
        ? "editor/next.actual.config.ts"
        : relative
    );
    assert((await lstat(source)).isFile(), `Expected source file: ${relative}`);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await copyFile(source, destination);
    hashes.push({ path: relative, sha256: hash(await readFile(destination)) });
  }
  const editor = path.join(workspace, "editor");
  await symlink(
    path.join(repository, "editor/node_modules"),
    path.join(editor, "node_modules"),
    "dir"
  );
  await symlink(
    path.join(repository, "node_modules"),
    path.join(workspace, "node_modules"),
    "dir"
  );
  await put(
    path.join(editor, "next.config.ts"),
    `import original from './next.actual.config';
export default {...original, turbopack: {...original.turbopack, root: ${JSON.stringify(repository)}}};\n`
  );
  await put(
    path.join(editor, "app/layout.tsx"),
    `export default function Layout({children}: {children: React.ReactNode}) { return <html><body>{children}</body></html>; }\n`
  );
  await put(
    path.join(editor, "app/page.tsx"),
    `export default function Page() { return <main>Forms API fixture</main>; }\n`
  );
  return hashes;
}

async function reserve(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return () => new Promise((resolve) => server.close(resolve));
}

async function ready(server, origin) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    assert(
      server.child.exitCode === null && server.child.signalCode === null,
      "Next exited before readiness"
    );
    try {
      const response = await fetch(origin, {
        redirect: "manual",
        signal: AbortSignal.timeout(1000),
      });
      if (response.status === 200) return;
    } catch {
      /* retry only the read-only readiness probe */
    }
    await delay(100);
  }
  throw new Error("Next readiness deadline exceeded");
}

async function main() {
  const args = process.argv.slice(2);
  assert(
    args.length === 2 && args[0] === "--state",
    "Usage: node scripts/forms-local/proof.mjs --state ABSOLUTE_FIXTURE_STATE"
  );
  assert(Number(process.versions.node.split(".")[0]) >= 24, "Node24+ required");
  const state = await readState(args[1]);
  assert.equal(
    state.phase,
    "bootstrapped",
    "Use a fresh bootstrapped owned local fixture"
  );
  const setup = JSON.parse(await readFile(state.setupPath, "utf8"));
  assert.equal(setup.apiUrl, "http://127.0.0.1:55431");
  const cache = path.join(repository, ".cache/forms-local");
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const cacheStat = await lstat(cache);
  assert(
    cacheStat.isDirectory() &&
      !cacheStat.isSymbolicLink() &&
      (cacheStat.mode & 0o077) === 0,
    "Expected private Forms cache"
  );
  const workspace = await mkdtemp(path.join(cache, "next-"));
  const reportPath = path.join(cache, `result-${randomUUID()}.json`);
  const report = {
    mode: "current-next",
    node: process.version,
    next: require("next/package.json").version,
    backend: "real-local-supabase",
    passed: false,
    sources: [],
    databaseSources: state.sources,
  };
  let phase = "snapshot";
  let provider;
  let releasePort;
  const logs = [];
  const tick = setInterval(
    () => console.log(`Forms proof: ${phase} in progress.`),
    30_000
  );
  const interrupt = () => {
    for (const child of children) void child.stop();
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    releasePort = await reserve(3000);
    provider = await createProviders();
    report.harness = await Promise.all(
      [
        "proof.mjs",
        "sources.mjs",
        "fixtures.mjs",
        "scenarios.mjs",
        "providers.mjs",
        "network.cjs",
      ].map(async (name) => ({
        path: `scripts/forms-local/${name}`,
        sha256: hash(await readFile(path.join(scripts, name))),
      }))
    );
    report.sources = await snapshot(workspace);
    const editor = path.join(workspace, "editor");
    const home = path.join(workspace, "home");
    await mkdir(home, { mode: 0o700 });
    const env = {
      PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(
        path.delimiter
      ),
      HOME: home,
      TMPDIR: workspace,
      LANG: "C",
      TZ: "UTC",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_GRIDA_USE_TELEMETRY: "0",
      NEXT_PUBLIC_SUPABASE_URL: setup.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: setup.publishableKey,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: setup.anonKey,
      SUPABASE_SECRET_KEY: setup.serviceRoleKey,
      SUPABASE_SERVICE_ROLE_KEY: setup.serviceRoleKey,
      GRIDA_S2S_PRIVATE_API_KEY: randomBytes(32).toString("hex"),
      RESEND_API_KEY: "re_forms_local_fixture",
      BIRD_API_KEY: "forms-local-fixture",
      BIRD_WORKSPACE_ID: "forms-fixture",
      BIRD_SMS_CHANNEL_ID: "forms-fixture",
      IPINFO_ACCESS_TOKEN: "forms-local-fixture",
      NEXT_PUBLIC_DOCS_URL: "http://127.0.0.1:3000",
      NEXT_PUBLIC_BLOG_URL: "http://127.0.0.1:3000",
      GRIDA_FORMS_TEST_PORTS: `3000,55431,${new URL(provider.origin).port}`,
      GRIDA_FORMS_TEST_PROVIDER_ORIGIN: provider.origin,
      NODE_OPTIONS: `--dns-result-order=ipv4first --require=${JSON.stringify(path.join(scripts, "network.cjs"))}`,
    };
    phase = "production Next build";
    console.log(
      `Forms proof: current Next ${report.next}, ${report.node}, real local backend.`
    );
    const build = launch(process.execPath, [next, "build"], {
      cwd: editor,
      env,
    });
    try {
      await build.wait(240_000);
    } finally {
      logs.push(build.log());
      await build.stop();
    }
    phase = "fixture overlay";
    const { createFixtures } = await import("./fixtures.mjs");
    const fixture = await createFixtures({
      setup,
      executeSql: async (sql) => {
        // readState pins project identity and socket. No caller selects a database.
        await readState(args[1]);
        const command = launch(
          "docker",
          [
            "--host",
            `unix://${state.dockerSocket}`,
            "exec",
            "-i",
            "supabase_db_grida_auth_test",
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
            "-At",
          ],
          {
            cwd: state.workdir,
            env: guards.childEnv(state),
            input: sql,
          }
        );
        try {
          return await command.wait(30_000);
        } finally {
          logs.push(command.log());
          await command.stop();
        }
      },
    });
    phase = "current-owner scenarios";
    await releasePort();
    releasePort = undefined;
    const server = launch(
      process.execPath,
      [next, "start", "-H", "127.0.0.1", "-p", "3000"],
      { cwd: editor, env }
    );
    try {
      await ready(server, "http://127.0.0.1:3000");
      const { runFormsScenarios, prepareCarryover } =
        await import("./scenarios.mjs");
      report.scenarios = await runFormsScenarios({
        origin: "http://127.0.0.1:3000",
        webOrigin: "http://localhost:3000",
        fixture,
        provider,
        log: (message) => console.log(`Forms proof: ${message}`),
      });
      assert(
        provider.calls.every(
          (call) =>
            call.path === "/resend/emails" || call.path.startsWith("/ipinfo/")
        ),
        "Unexpected provider operation"
      );
      const carryover = await prepareCarryover({
        origin: "http://127.0.0.1:3000",
        fixture,
        log: (message) => console.log(`Forms proof: ${message}`),
      });
      await put(
        path.join(state.root, "forms-carryover.json"),
        JSON.stringify(carryover) + "\n"
      );
      report.carryoverPrepared = true;
      report.passed = true;
    } finally {
      logs.push(server.log());
      await server.stop();
    }
  } finally {
    clearInterval(tick);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    for (const child of children) await child.stop();
    if (releasePort) await releasePort();
    await provider?.close();
    report.phase = phase;
    report.cleanup =
      "Owned application processes stopped; source snapshot removed; Supabase remains explicitly owned by --state for operator stop";
    await put(reportPath, JSON.stringify(report, null, 2) + "\n");
    await put(
      reportPath.replace(/\.json$/, ".log"),
      logs.map(guards.redact).join("\n")
    );
    await rm(workspace, { recursive: true, force: true });
    console.log(
      `Forms proof ${report.passed ? "passed" : "failed"}: ${reportPath}`
    );
  }
}

main().catch((error) => {
  console.error(guards.redact(error.stack ?? String(error)));
  process.exitCode = 1;
});
