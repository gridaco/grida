#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
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
import { createProviders } from "./providers.mjs";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(scripts, "../..");
const require = createRequire(path.join(repository, "apps/api/package.json"));
const nitroPackage = require.resolve("nitropack/package.json");
const nitro = path.join(path.dirname(nitroPackage), "dist/cli/index.mjs");
const tsx = require.resolve("tsx");
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

async function files(directory) {
  const result = [];
  for (const entry of await readdir(path.join(repository, directory), {
    withFileTypes: true,
  })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(relative)));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`Unexpected source link: ${relative}`);
  }
  return result.sort();
}

async function snapshot(workspace) {
  const application = [
    "apps/api/package.json",
    "apps/api/tsconfig.json",
    "apps/api/nitro.config.ts",
    ...(await files("apps/api/server")),
  ];
  const hashes = [];
  for (const relative of application) {
    const source = path.join(repository, relative);
    const destination = path.join(workspace, relative);
    assert((await lstat(source)).isFile(), `Expected source file: ${relative}`);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await copyFile(source, destination);
    hashes.push({ path: relative, sha256: hash(await readFile(destination)) });
  }
  // These linked dependencies must be built before the runner. Hash both source
  // and compiled package bytes consumed by the real Nitro bundler.
  for (const relative of [
    "pnpm-lock.yaml",
    "apps/api/vercel.json",
    "editor/tsconfig.json",
    "editor/package.json",
    "editor/env.ts",
    "editor/k/env.ts",
    "editor/grida-forms-hosted/internal-sdk/submit.ts",
    "editor/scaffolds/panels/row-create.ts",
    "editor/components/formfield/file-upload-field/uploader.ts",
    "editor/components/formfield/email-challenge.tsx",
    "editor/lib/supabase/storage-ext.ts",
    "packages/ui/package.json",
    "packages/ui/src/lib/utils.ts",
    ...[
      "button",
      "input",
      "input-group",
      "input-otp",
      "spinner",
      "textarea",
    ].map((name) => `packages/ui/src/components/${name}.tsx`),
    ...(await files("packages/grida-forms")),
    ...(await files("packages/grida-tokens")),
    ...(await files("database")),
  ])
    hashes.push({
      path: relative,
      sha256: hash(await readFile(path.join(repository, relative))),
    });
  await symlink(
    path.join(repository, "apps/api/node_modules"),
    path.join(workspace, "apps/api/node_modules"),
    "dir"
  );
  await symlink(
    path.join(repository, "node_modules"),
    path.join(workspace, "node_modules"),
    "dir"
  );
  // Fixture-only diagnostics omit messages and data; no debug switch ships in
  // the product. Stack frames identify bundling/adapter faults in private logs.
  await put(
    path.join(workspace, "apps/api/server/plugins/proof-errors.ts"),
    `
import { defineNitroPlugin } from "nitropack/runtime";
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook("error", (error) => {
    const frames = error.stack?.split("\\n").slice(1).filter((line) => /^\\s+at /.test(line));
    console.error(JSON.stringify({ event: "local_proof_error", frames }));
  });
});
`
  );
  return hashes;
}

async function reserve(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    port: server.address().port,
    release: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function ready(server, origin) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    assert(
      server.child.exitCode === null && server.child.signalCode === null,
      "Nitro exited before readiness"
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
  throw new Error("Nitro readiness deadline exceeded");
}

async function main() {
  const args = process.argv.slice(2);
  assert(
    (args.length === 2 ||
      (args.length === 3 && args[2] === "--resume-carryover")) &&
      args[0] === "--state",
    "Usage: node scripts/forms-local/proof.mjs --state ABSOLUTE_FIXTURE_STATE [--resume-carryover]"
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
  const workspace = await mkdtemp(path.join(cache, "nitro-"));
  const reportPath = path.join(cache, `result-${randomUUID()}.json`);
  const report = {
    mode: "extracted-nitro",
    node: process.version,
    nitro: require("nitropack/package.json").version,
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
    const reservation = await reserve(0);
    releasePort = reservation.release;
    const origin = `http://127.0.0.1:${reservation.port}`;
    const webOrigin = "http://localhost:3000";
    provider = await createProviders();
    report.harness = await Promise.all(
      [
        "proof.mjs",
        "clients.ts",
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
    const api = path.join(workspace, "apps/api");
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
      SUPABASE_URL: setup.apiUrl,
      SUPABASE_PUBLISHABLE_KEY: setup.publishableKey,
      GRIDA_OPEN_API_ORIGIN: origin,
      GRIDA_WEB_ORIGIN: webOrigin,
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: String(reservation.port),
      SUPABASE_SECRET_KEY: setup.serviceRoleKey,
      RESEND_API_KEY: "re_forms_local_fixture",
      BIRD_API_KEY: "forms-local-fixture",
      BIRD_WORKSPACE_ID: "forms-fixture",
      BIRD_SMS_CHANNEL_ID: "forms-fixture",
      IPINFO_ACCESS_TOKEN: "forms-local-fixture",
      GRIDA_FORMS_TEST_PORTS: `${reservation.port},55431,${new URL(provider.origin).port}`,
      GRIDA_FORMS_TEST_PROVIDER_ORIGIN: provider.origin,
      NODE_OPTIONS: `--dns-result-order=ipv4first --require=${JSON.stringify(path.join(scripts, "network.cjs"))}`,
    };
    phase = "production Nitro build";
    console.log(
      `Forms proof: extracted Nitro ${report.nitro}, ${report.node}, real local backend.`
    );
    const build = launch(
      process.execPath,
      [nitro, "build", "--preset", "node-server"],
      {
        cwd: api,
        env,
      }
    );
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
    phase = "extracted-owner scenarios";
    await releasePort();
    releasePort = undefined;
    const server = launch(
      process.execPath,
      [path.join(api, ".output/server/index.mjs")],
      { cwd: api, env }
    );
    try {
      await ready(server, `${origin}/health`);
      const {
        runFormsScenarios,
        runTransportScenarios,
        runClientScenarios,
        resumeCarryover,
      } = await import("./scenarios.mjs");
      report.scenarios = await runFormsScenarios({
        origin,
        webOrigin,
        fixture,
        provider,
        log: (message) => console.log(`Forms proof: ${message}`),
      });
      report.transport = await runTransportScenarios({
        origin,
        fixture,
        webOrigin,
      });
      phase = "actual editor clients";
      report.clients = await runClientScenarios({
        origin,
        fixture,
        provider,
        log: (message) => console.log(`Forms proof: ${message}`),
        runClient: async (input) => {
          const inputPath = path.join(
            workspace,
            `client-input-${randomUUID()}.json`
          );
          const outputPath = path.join(
            workspace,
            `client-output-${randomUUID()}.json`
          );
          await put(inputPath, JSON.stringify(input));
          const client = launch(
            process.execPath,
            [
              "--import",
              tsx,
              path.join(scripts, "clients.ts"),
              inputPath,
              outputPath,
            ],
            {
              cwd: path.join(repository, "editor"),
              env: {
                PATH: env.PATH,
                HOME: env.HOME,
                TMPDIR: env.TMPDIR,
                LANG: "C",
                TZ: "UTC",
                NODE_ENV: "production",
                NODE_OPTIONS: env.NODE_OPTIONS,
                GRIDA_FORMS_TEST_PORTS: env.GRIDA_FORMS_TEST_PORTS,
                GRIDA_FORMS_TEST_PROVIDER_ORIGIN:
                  env.GRIDA_FORMS_TEST_PROVIDER_ORIGIN,
                NEXT_PUBLIC_GRIDA_OPEN_API_ORIGIN: origin,
                TSX_TSCONFIG_PATH: path.join(
                  repository,
                  "editor/tsconfig.json"
                ),
              },
            }
          );
          try {
            await client.wait(90_000);
            return JSON.parse(await readFile(outputPath, "utf8"));
          } finally {
            logs.push(client.log());
            await client.stop();
          }
        },
      });
      if (args[2] === "--resume-carryover") {
        // This metadata was prepared through the pre-extraction owner on the
        // same owned fixture. Missing or already-consumed drafts fail loudly.
        const carryover = JSON.parse(
          await readFile(path.join(state.root, "forms-carryover.json"), "utf8")
        );
        await resumeCarryover({
          origin,
          setup,
          carryover,
          log: (message) => console.log(`Forms proof: ${message}`),
        });
        report.carryoverResumed = true;
      }
      assert(
        provider.calls.every(
          (call) =>
            call.path === "/resend/emails" || call.path.startsWith("/ipinfo/")
        ),
        "Unexpected provider operation"
      );
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
