// GRIDA-SEC-010, GRIDA-SEC-011 — non-root Linux installed file-custody smoke.
// Run in a new disposable container with --network none and a read-only input mount.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
async function main() {
  assert.equal(process.platform, "linux");
  assert(process.getuid() > 0, "Run as the container's unprivileged node user");
  assert(Number(process.versions.node.split(".")[0]) >= 24);
  const [archive] = process.argv.slice(2);
  assert(process.argv.length === 3 && path.isAbsolute(archive));
  const owned = await mkdtemp("/tmp/grida-cli-linux-");
  const runtime = path.join(owned, "installed");
  const home = path.join(owned, "home");
  let child;
  const env = {
    PATH: path.dirname(process.execPath),
    HOME: home,
    USERPROFILE: home,
    TMPDIR: owned,
    TMP: owned,
    TEMP: owned,
    CI: "true",
    NO_COLOR: "1",
    GRIDA_HOME: path.join(owned, "profile"),
    GRIDA_CLI_LOCAL_CONFIG: path.join(owned, "public-client.json"),
    npm_config_cache: path.join(owned, "npm-cache"),
    npm_config_userconfig: path.join(owned, "npmrc"),
    npm_config_globalconfig: path.join(owned, "global-npmrc"),
  };
  try {
    for (const directory of [home, runtime])
      await mkdir(directory, { mode: 0o700 });
    for (const filename of [
      env.npm_config_userconfig,
      env.npm_config_globalconfig,
    ])
      await writeFile(filename, "", { mode: 0o600 });
    await writeFile(
      env.GRIDA_CLI_LOCAL_CONFIG,
      JSON.stringify({
        clientId: "cli-offline-smoke",
        publishableKey: "sb_publishable_synthetic_offline",
        issuer: "http://127.0.0.1:55431/auth/v1",
        apiOrigin: "http://127.0.0.1:3041",
        redirectUris: [
          "http://127.0.0.1:55435/callback",
          "http://127.0.0.1:55436/callback",
        ],
      }),
      { mode: 0o600 }
    );
    const npm = path.resolve(
      path.dirname(process.execPath),
      "../lib/node_modules/npm/bin/npm-cli.js"
    );
    await execute(
      process.execPath,
      [
        npm,
        "install",
        "--prefix",
        runtime,
        archive,
        "--offline",
        "--omit=optional",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
      ],
      { cwd: owned, env, timeout: 60_000, maxBuffer: 512 * 1024 }
    );
    const bin = await realpath(path.join(runtime, "node_modules/.bin/grida"));
    const run = async (args, code = 0) => {
      let result;
      try {
        result = await execute(process.execPath, [bin, ...args], {
          cwd: runtime,
          env,
          timeout: 15_000,
          maxBuffer: 64 * 1024,
        });
        assert.equal(code, 0);
      } catch (error) {
        assert.equal(error.code, code);
        result = error;
      }
      assert(
        !/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(
          result.stdout + result.stderr
        )
      );
      return result;
    };
    assert.match((await run(["--help"])).stdout, /Usage: grida/);
    assert.match(
      (await run(["docs", "account", "credits"])).stdout,
      /^https:\/\/grida\.co\//
    );
    assert.equal(
      JSON.parse((await run(["auth", "status", "--json"], 1)).stdout).error
        .code,
      "custody_failed"
    );
    assert.equal(
      JSON.parse(
        (
          await run([
            "auth",
            "storage",
            "migrate",
            "file",
            "--json",
            "--no-input",
          ])
        ).stdout
      ).backend,
      "file"
    );
    child = spawn(process.execPath, [bin, "auth", "login", "--no-browser"], {
      cwd: runtime,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "",
      stdout = "",
      published = false;
    const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
    const finished = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
    child.stdout.on("data", (bytes) => {
      stdout += bytes;
      if (stdout.length > 64 * 1024) child.kill("SIGKILL");
    });
    child.stderr.on("data", (bytes) => {
      stderr += bytes;
      if (stderr.length > 64 * 1024) {
        child.kill("SIGKILL");
        return;
      }
      const value = stderr.match(
        /Open this URL in your browser:\n([^\r\n]+)\r?\n/
      )?.[1];
      if (value && !published) {
        try {
          const url = new URL(value);
          if (
            url.origin + url.pathname !==
            "http://127.0.0.1:55431/auth/v1/oauth/authorize"
          )
            throw new Error("Invalid manual login destination");
          published = true;
          child.kill("SIGINT");
        } catch {
          // Stream callbacks must settle through the owned process/finally path;
          // URL parser errors can carry the untrusted input in their diagnostics.
          child.kill("SIGKILL");
        }
      }
    });
    const status = await finished;
    assert(published && status.code === 1 && status.signal === null);
    assert.match(stderr, /cancelled/);
    child = undefined;
    assert.equal(
      JSON.parse(
        (await run(["auth", "status", "--json", "--no-input"], 1)).stdout
      ).state,
      "signed-out"
    );
    assert.equal(
      JSON.parse((await run(["auth", "storage", "show", "--json"])).stdout)
        .backend,
      "file"
    );
    assert.equal(
      JSON.parse((await run(["auth", "logout", "--json"])).stdout).revocation,
      "not-needed"
    );
    // Public metadata is enough for this offline smoke; no session was issued.
    const manifest = JSON.parse(
      await readFile(
        path.join(runtime, "node_modules/grida/package.json"),
        "utf8"
      )
    );
    assert.equal(manifest.name, "grida");
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        child.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await rm(owned, { recursive: true, force: true });
  }
  console.log(
    JSON.stringify({
      passed: true,
      runtime: process.version,
      platform: `${process.platform}/${process.arch}`,
      uid: process.getuid(),
      coverage:
        "offline installation/help/docs/file-migration/manual-login-cancel/restart/status/logout",
      realOAuth: false,
      nativeKeyring: false,
    })
  );
}
main().catch(() => {
  console.error(
    "Linux CLI smoke failed; private command diagnostics withheld."
  );
  process.exitCode = 1;
});
