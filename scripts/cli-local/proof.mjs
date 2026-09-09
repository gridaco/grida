// GRIDA-SEC-010, GRIDA-SEC-011 — real installed CLI, production custody, owned local issuer.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { readState } from "../auth-local/stack.mjs";
import { fixture } from "../auth-local/guards.mjs";
import { CliRelease } from "../cli-release/prepare.mjs";

const execute = promisify(execFile);
const repository = fileURLToPath(new URL("../../", import.meta.url));
const guard = fileURLToPath(new URL("./network.cjs", import.meta.url));
const jwt = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
const origins = new Set([
  fixture.editorOrigin,
  fixture.apiUrl,
  ...fixture.redirectUris.map((value) => new URL(value).origin),
]);
const reportPath = path.join(repository, ".cache/cli-local/result.json");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    assert(
      !entry.isSymbolicLink(),
      "Fixture package/state cannot escape through symlinks"
    );
    const filename = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await files(filename)));
    else if (entry.isFile()) result.push(filename);
  }
  return result.sort();
}
async function sourceHashes() {
  const result = {};
  for (const name of [
    "grida-cli",
    "grida-auth",
    "grida-account",
    "grida-home",
  ]) {
    const root = path.join(repository, "packages", name);
    for (const filename of [
      path.join(root, "package.json"),
      ...(await readdir(root))
        .filter((value) => /^tsdown\.config\.[cm]?ts$/.test(value))
        .map((value) => path.join(root, value)),
      ...(await files(path.join(root, "dist"))),
      ...(await files(path.join(root, "src"))).filter(
        (value) => !/\.(?:test|spec)\.[cm]?tsx?$/.test(value)
      ),
    ]) {
      result[path.relative(repository, filename)] = hash(
        await readFile(filename)
      );
    }
  }
  return result;
}
function localUrl(value) {
  const url = new URL(value);
  assert(
    origins.has(url.origin) && !url.username && !url.password && !url.hash,
    "Browser destination escaped the fixture"
  );
  return url;
}

async function main() {
  assert(
    Number(process.versions.node.split(".")[0]) >= 24,
    "Node 24+ is required"
  );
  const { values } = parseArgs({
    options: {
      state: { type: "string" },
      archive: { type: "string" },
    },
  });
  assert(
    values.state,
    "Usage: node scripts/cli-local/proof.mjs --state /absolute/fixture.json [--archive /absolute/candidate.tgz]"
  );
  let candidate;
  if (values.archive !== undefined) {
    assert(path.isAbsolute(values.archive), "Archive must be an absolute path");
    const stat = await lstat(values.archive);
    assert(
      stat.isFile() && stat.size > 0 && stat.size <= 16 * 1024 * 1024,
      "Expected a bounded regular tarball"
    );
    candidate = await readFile(values.archive);
  }
  const state = await readState(values.state);
  assert.equal(state.phase, "bootstrapped");
  const setup = JSON.parse(await readFile(state.setupPath, "utf8"));
  assert.equal(setup.apiUrl, fixture.apiUrl);
  assert.equal(setup.editorOrigin, fixture.editorOrigin);
  const registration = JSON.parse(
    await readFile(state.publicClientPath, "utf8")
  );
  assert.equal(registration.issuer, fixture.issuer);
  assert.equal(registration.apiOrigin, fixture.editorOrigin);
  assert.deepEqual(registration.redirectUris, fixture.redirectUris);
  const owned = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-cli-proof-"))
  );
  const home = path.join(owned, "home");
  const runtime = path.join(owned, "installed");
  const profiles = [path.join(owned, "first"), path.join(owned, "second")];
  const children = new Set();
  const listeners = new Set();
  let browser;
  let sequence = 0;
  let blockedBrowserRequests = 0;
  const report = {
    passed: false,
    phase: "setup",
    runtime: process.version,
    platform: `${process.platform}/${process.arch}`,
    phases: [],
  };
  const childEnv = {
    PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(
      path.delimiter
    ),
    HOME: home,
    USERPROFILE: home,
    TMPDIR: path.join(owned, "tmp"),
    TMP: path.join(owned, "tmp"),
    TEMP: path.join(owned, "tmp"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    CI: "true",
    DO_NOT_TRACK: "1",
    NO_COLOR: "1",
    TERM: "dumb",
    npm_config_userconfig: path.join(owned, "npmrc"),
    npm_config_globalconfig: path.join(owned, "global-npmrc"),
    npm_config_cache: path.join(owned, "npm-cache"),
  };
  const stopChildren = async () => {
    await Promise.allSettled(
      [...children].map(async (child) => {
        child.kill("SIGTERM");
        await new Promise((resolve) => {
          const timer = setTimeout(() => child.kill("SIGKILL"), 2_000);
          child.once("close", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      })
    );
  };
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    for (const child of children) child.kill("SIGTERM");
    void browser?.close().catch(() => undefined);
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  async function phase(label, operation) {
    assert(!interrupted, "CLI fixture interrupted");
    report.phase = label;
    console.info(`[cli-proof] ${label}: start`);
    await operation();
    report.phases.push(label);
    console.info(`[cli-proof] ${label}: passed`);
  }
  let bin;
  function command(args, profile = profiles[0], extra = {}) {
    assert(!interrupted, "CLI fixture interrupted");
    report.command = args.slice(0, 3);
    const outputPath = path.join(owned, `command-${sequence++}.json`);
    const child = spawn(process.execPath, ["--require", guard, bin, ...args], {
      cwd: runtime,
      env: {
        ...childEnv,
        GRIDA_HOME: profile,
        GRIDA_CLI_LOCAL_CONFIG: state.publicClientPath,
        GRIDA_CLI_PROOF_ROOT: owned,
        GRIDA_CLI_PROOF_REPORT: outputPath,
        ...extra,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);
    let stdout = "",
      stderr = "",
      overflow = false;
    let resolveUrl, rejectUrl;
    const url = new Promise((resolve, reject) => {
      resolveUrl = resolve;
      rejectUrl = reject;
    });
    // Every command observes this optional login channel, including failures before launch.
    void url.catch(() => undefined);
    const collect = (channel, bytes) => {
      if (stdout.length + stderr.length + bytes.length > 64 * 1024) {
        overflow = true;
        child.kill("SIGKILL");
        return;
      }
      if (channel === "stdout") stdout += bytes.toString();
      else stderr += bytes.toString();
      const match = stderr.match(
        /Open this URL in your browser:\n([^\r\n]+)\r?\n/
      );
      if (match) {
        try {
          const value = localUrl(match[1]);
          assert.equal(
            value.origin + value.pathname,
            fixture.issuer + "/oauth/authorize"
          );
          assert.equal(
            value.searchParams.get("client_id"),
            registration.clientId
          );
          assert.equal(value.searchParams.get("code_challenge_method"), "S256");
          assert(
            fixture.redirectUris.includes(
              value.searchParams.get("redirect_uri")
            )
          );
          resolveUrl(value.href);
        } catch {
          rejectUrl(new Error("Invalid manual authorization destination"));
          child.kill("SIGTERM");
        }
      }
    };
    child.stdout.on("data", (bytes) => collect("stdout", bytes));
    child.stderr.on("data", (bytes) => collect("stderr", bytes));
    const timer = setTimeout(() => child.kill("SIGTERM"), 90_000);
    const hardTimer = setTimeout(() => child.kill("SIGKILL"), 95_000);
    const done = new Promise((resolve, reject) => {
      child.once("error", () => {
        reject(new Error("Installed CLI process failed to start"));
        rejectUrl(new Error("Login process unavailable"));
      });
      child.once("close", async (code, signal) => {
        children.delete(child);
        clearTimeout(timer);
        clearTimeout(hardTimer);
        rejectUrl(
          new Error("Login ended before producing an authorization URL")
        );
        try {
          assert(
            !overflow && !signal,
            "CLI output or process lifetime exceeded the bound"
          );
          assert(
            !jwt.test(stdout + stderr),
            "CLI disclosed a bearer credential"
          );
          const stats = JSON.parse(await readFile(outputPath, "utf8"));
          report.last_process = {
            exit: code,
            denied: stats.denied,
            error_code: stderr.match(/\(([a-z_]+)\)/)?.[1] ?? null,
          };
          resolve({ code, stdout, stderr, stats });
        } catch {
          reject(new Error("Installed CLI output/guard contract failed"));
        }
      });
    });
    void done.catch(() => undefined);
    return { child, url, done };
  }
  async function json(
    args,
    { code = 0, profile = profiles[0], extra = {}, denied = 0 } = {}
  ) {
    const result = await command(
      [...args, "--json", "--no-input"],
      profile,
      extra
    ).done;
    assert.equal(result.code, code, "Unexpected CLI exit status");
    assert.equal(
      result.stats.denied,
      denied,
      "CLI attempted unexpected authority"
    );
    const value = JSON.parse(result.stdout);
    return { value, stats: result.stats };
  }
  async function busy(port) {
    const server = net.createServer();
    listeners.add(server);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    return server;
  }
  async function close(server) {
    await new Promise((resolve) => server.close(resolve));
    listeners.delete(server);
  }
  async function login(profile, email) {
    await browser.clearCookies();
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);
    const process = command(
      ["auth", "login", "--storage", "file", "--no-browser"],
      profile
    );
    try {
      const url = await process.url;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (new URL(page.url()).pathname === "/insiders/auth/basic") {
        assert.equal(
          await page.locator('input[name="challenge"]').inputValue(),
          ""
        );
        const user = setup.users.find((value) => value.email === email);
        assert(user, "Expected a seeded fixture user");
        await page.getByLabel("Email", { exact: true }).fill(user.email);
        await page.getByLabel("Password", { exact: true }).fill(user.password);
        await page
          .getByRole("button", { name: "Login", exact: true })
          .click({ noWaitAfter: true });
        await page.waitForURL(
          (value) =>
            value.pathname === "/oauth/consent" ||
            fixture.redirectUris.includes(value.origin + value.pathname),
          {
            waitUntil: "domcontentloaded",
          }
        );
      }
      if (new URL(page.url()).pathname === "/oauth/consent") {
        await page.getByTestId("oauth-consent").waitFor();
        const decision = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/private/oauth/decision" &&
            response.request().method() === "POST"
        );
        await page
          .getByRole("button", { name: "Allow", exact: true })
          .click({ noWaitAfter: true });
        assert.equal((await decision).status(), 303);
      }
      await page.waitForURL(
        (value) => fixture.redirectUris.includes(value.origin + value.pathname),
        { waitUntil: "domcontentloaded" }
      );
      const result = await process.done;
      assert.equal(result.code, 0, "CLI login failed");
      assert.equal(result.stats.denied, 0);
      assert(
        result.stats.requests.some(
          (value) => value.path === "/auth/v1/oauth/token"
        )
      );
    } finally {
      process.child.kill("SIGTERM");
      await page.close();
    }
  }
  async function credentialDigest(profile) {
    const names = (await files(profile)).filter(
      (name) => path.basename(name) === "credentials.json"
    );
    assert.equal(names.length, 1, "One production file profile is required");
    return { digest: hash(await readFile(names[0])), filename: names[0] };
  }
  try {
    for (const directory of [
      home,
      childEnv.TMPDIR,
      runtime,
      ...profiles,
      path.join(owned, "archives"),
    ])
      await mkdir(directory, { recursive: true, mode: 0o700 });
    for (const filename of [
      childEnv.npm_config_userconfig,
      childEnv.npm_config_globalconfig,
    ])
      await writeFile(filename, "", { mode: 0o600 });
    report.sources = await sourceHashes();
    await phase("offline package installation", async () => {
      const source = path.join(repository, "packages/grida-cli");
      const npm = await CliRelease.npm();
      const options = {
        cwd: owned,
        env: childEnv,
        timeout: 60_000,
        maxBuffer: 512 * 1024,
      };
      let archive;
      if (candidate) {
        archive = path.join(owned, "archives", "candidate.tgz");
        await writeFile(archive, candidate, { mode: 0o600 });
      } else {
        const out = path.join(owned, "archives", "candidate");
        const record = await CliRelease.prepare(out);
        await CliRelease.verify(out);
        archive = path.join(out, record.archive);
      }
      report.archive_sha256 = hash(await readFile(archive));
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
        options
      );
      const installed = path.join(runtime, "node_modules/grida");
      const manifest = JSON.parse(
        await readFile(path.join(installed, "package.json"), "utf8")
      );
      CliRelease.manifest(manifest);
      assert.deepEqual(
        manifest,
        JSON.parse(await readFile(path.join(source, "package.json"), "utf8"))
      );
      const installedFiles = await files(installed); // No package-internal symlink to workspace source/dependencies.
      CliRelease.files(
        installedFiles.map((filename) => ({
          path: path.relative(installed, filename),
        }))
      );
      bin = await realpath(path.join(runtime, "node_modules/.bin/grida"));
      assert.equal(bin, path.resolve(installed, manifest.bin.grida));
      assert.equal(
        hash(await readFile(bin)),
        hash(await readFile(path.join(source, manifest.bin.grida)))
      );
      await assert.rejects(
        lstat(path.join(runtime, "node_modules/@github/keytar")),
        { code: "ENOENT" }
      );
      report.keyring = "optional binding omitted; no OS keyring access";
    });
    await phase("offline help, docs and noninteractive failures", async () => {
      for (const args of [
        ["--help"],
        ["--version"],
        ["docs"],
        ["docs", "account", "credits"],
      ]) {
        const result = await command(args, profiles[0], {
          GRIDA_CLI_LOCAL_CONFIG: "",
          GRIDA_CLI_PROOF_OFFLINE: "1",
        }).done;
        assert.equal(result.code, 0);
        assert.equal(result.stats.denied, 0);
        assert.deepEqual(result.stats.requests, []);
        if (args[0] === "docs")
          assert.match(result.stdout, /^https:\/\/grida\.co\/[^\s]+\n$/);
      }
      assert.equal(
        (await json(["auth", "login"], { code: 1 })).value.error.code,
        "interaction_required"
      );
      assert.equal(
        (await json(["account", "credits", "--org-id", "0"], { code: 2 })).value
          .error.code,
        "invalid_usage"
      );
      assert.equal(
        (await json(["auth", "storage", "show"])).value.backend,
        "keyring"
      );
      assert.equal(
        (await json(["auth", "status"], { code: 1 })).value.error.code,
        "custody_failed"
      );
      assert.equal(
        (await json(["auth", "storage", "migrate", "file"])).value.backend,
        "file"
      );
      assert.equal(
        (await json(["auth", "status"], { code: 1 })).value.state,
        "signed-out"
      );
      assert.equal(
        (await json(["account", "view"], { code: 1 })).value.error.code,
        "signed_out"
      );
    });
    await phase(
      "occupied callbacks and cancelled login release ports",
      async () => {
        const first = await busy(55435),
          second = await busy(55436);
        try {
          const result = await command(["auth", "login", "--no-browser"]).done;
          assert.equal(result.code, 1);
          assert.match(result.stderr, /callback_unavailable/);
          assert(!result.stderr.includes("Open this URL"));
          assert.equal(result.stats.denied, 0);
        } finally {
          await Promise.all([close(first), close(second)]);
        }
        const pending = command(["auth", "login", "--no-browser"]);
        await pending.url;
        pending.child.kill("SIGINT");
        const result = await pending.done;
        assert.equal(result.code, 1);
        assert.match(result.stderr, /cancelled/);
        await close(await busy(55435));
        await close(await busy(55436));
        assert.equal(
          (await json(["auth", "status"], { code: 1 })).value.state,
          "signed-out"
        );
      }
    );
    const { chromium } = createRequire(
      path.join(repository, "editor/package.json")
    )("@playwright/test");
    report.phase = "isolated browser startup";
    browser = await chromium.launchPersistentContext(
      path.join(owned, "browser"),
      {
        headless: true,
        env: childEnv,
        serviceWorkers: "block",
        args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
        timeout: 30_000,
      }
    );
    await browser.route("**/*", async (route) => {
      try {
        localUrl(route.request().url());
      } catch {
        blockedBrowserRequests++;
        await route.abort();
        return;
      }
      await route.continue();
    });
    await browser.routeWebSocket("**/*", (socket) => {
      const url = new URL(socket.url());
      if (url.origin !== fixture.editorOrigin.replace(/^http:/, "ws:")) {
        blockedBrowserRequests++;
        socket.close();
        return;
      }
      socket.connectToServer();
    });
    let firstAccount, secondAccount, initialStatus;
    await phase(
      "browser login, process restart and two-account reads",
      async () => {
        await login(profiles[0], "insider@grida.co");
        initialStatus = (await json(["auth", "status"])).value;
        assert.equal(initialStatus.state, "signed-in");
        assert.equal(initialStatus.identity.email, "insider@grida.co");
        firstAccount = (await json(["account", "view"])).value;
        assert.deepEqual(firstAccount.identity, initialStatus.identity);
        assert.deepEqual(
          firstAccount.organizations.map((value) => value.name),
          ["local"]
        );
        await login(profiles[1], "alice@acme.com");
        secondAccount = (
          await json(["account", "view"], { profile: profiles[1] })
        ).value;
        assert.equal(secondAccount.identity.email, "alice@acme.com");
        assert.deepEqual(
          secondAccount.organizations.map((value) => value.name),
          ["acme"]
        );
        assert.notEqual(secondAccount.identity.id, firstAccount.identity.id);
      }
    );
    await phase(
      "passive credits, explicit selection and RLS denial",
      async () => {
        const org = firstAccount.organizations[0];
        const implicit = (await json(["account", "credits"])).value;
        assert.deepEqual(implicit.organization, org);
        assert.equal(implicit.source, "cache");
        assert.equal(implicit.currency, "USD");
        assert.deepEqual(
          (await json(["account", "credits", "--org", org.name])).value,
          implicit
        );
        assert.deepEqual(
          (await json(["account", "credits", "--org-id", String(org.id)]))
            .value,
          implicit
        );
        const denied = await json(
          ["account", "credits", "--org-id", String(org.id)],
          { profile: profiles[1], code: 1 }
        );
        assert.equal(denied.value.error.code, "organization_not_found");
      }
    );
    await phase(
      "concurrent processes and real refresh with near-expiry application clock",
      async () => {
        const before = await credentialDigest(profiles[0]);
        const offset = initialStatus.expiresAt - Date.now() - 10_000;
        assert(
          Number.isSafeInteger(offset) && offset > 0 && offset <= 3_600_000
        );
        const results = await Promise.all(
          Array.from({ length: 3 }, () =>
            json(["account", "view"], {
              extra: { GRIDA_CLI_PROOF_CLOCK_OFFSET: String(offset) },
            })
          )
        );
        for (const result of results)
          assert.deepEqual(result.value, firstAccount);
        assert.equal(
          results
            .flatMap((result) => result.stats.requests)
            .filter((value) => value.path === "/auth/v1/oauth/token").length,
          1,
          "Concurrent account reads should consume one accepted near-expiry rotation"
        );
        assert.notEqual(
          (await credentialDigest(profiles[0])).digest,
          before.digest
        );
        assert(
          (await json(["auth", "status"])).value.expiresAt >
            initialStatus.expiresAt
        );
      }
    );
    await phase(
      "offline error, local logout and independent session survival",
      async () => {
        const offline = { GRIDA_CLI_PROOF_OFFLINE: "1" };
        const result = await json(["account", "view"], {
          code: 1,
          extra: offline,
          denied: 1,
        });
        assert.equal(result.value.error.code, "unavailable");
        assert.equal(
          (await json(["auth", "status"], { extra: offline })).value.state,
          "signed-in"
        );
        const logout = await json(["auth", "logout"]);
        assert.deepEqual(logout.value, {
          state: "signed-out",
          revocation: "confirmed",
        });
        assert.equal(
          (await json(["auth", "status"], { code: 1 })).value.state,
          "signed-out"
        );
        assert.equal(
          (await json(["account", "view"], { code: 1 })).value.error.code,
          "signed_out"
        );
        assert.deepEqual(
          (await json(["account", "view"], { profile: profiles[1] })).value,
          secondAccount
        );
        const file = await credentialDigest(profiles[0]);
        assert(
          !jwt.test(await readFile(file.filename, "utf8")),
          "Logout retained a bearer credential"
        );
        assert.equal(
          (await json(["auth", "logout"], { profile: profiles[1] })).value
            .revocation,
          "confirmed"
        );
      }
    );
    assert.equal(
      blockedBrowserRequests,
      0,
      "The real browser attempted an unexpected origin"
    );
    assert.deepEqual(
      await sourceHashes(),
      report.sources,
      "Sources changed during the installed proof"
    );
    report.passed = true;
    report.phase = "complete";
  } catch (error) {
    report.failure = {
      kind: error?.name === "AssertionError" ? "assertion" : "operation",
      location:
        typeof error?.stack === "string"
          ? (error.stack.match(/proof\.mjs:\d+:\d+/)?.[0] ?? null)
          : null,
    };
    throw error;
  } finally {
    await Promise.allSettled([
      browser?.close(),
      stopChildren(),
      ...[...listeners].map(close),
    ]);
    await rm(owned, { recursive: true, force: true });
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await mkdir(path.dirname(reportPath), { recursive: true, mode: 0o700 });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
    });
  }
  console.info(
    JSON.stringify({
      passed: true,
      phases: report.phases.length,
      runtime: report.runtime,
      platform: report.platform,
      report: reportPath,
    })
  );
}

main().catch(() => {
  console.error(
    "CLI fixture proof failed; the safe report identifies the phase. Credential-bearing process/browser diagnostics are withheld."
  );
  process.exitCode = 1;
});
