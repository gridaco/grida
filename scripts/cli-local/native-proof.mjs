// GRIDA-SEC-010 / GRIDA-SEC-011 — installed Rust CLI against an owned real issuer.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { fixture } from "../auth-local/guards.mjs";
import { readState } from "../auth-local/stack.mjs";
import { installNative } from "../cli-release/native-proof.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const reportPath = path.join(repository, ".cache/cli-local/native-result.json");
const jwt = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
const origins = new Set([
  fixture.editorOrigin,
  fixture.apiUrl,
  ...fixture.redirectUris.map((value) => new URL(value).origin),
]);

export function fixtureUrl(value) {
  const url = new URL(value);
  assert(
    origins.has(url.origin) && !url.username && !url.password && !url.hash,
    "Browser destination escaped the fixture"
  );
  return url;
}
export function authorizationUrl(value, registration) {
  const url = fixtureUrl(value);
  assert.equal(url.origin + url.pathname, fixture.issuer + "/oauth/authorize");
  for (const name of [
    "client_id",
    "response_type",
    "redirect_uri",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
  ])
    assert.equal(url.searchParams.getAll(name).length, 1);
  assert.equal(url.searchParams.get("client_id"), registration.clientId);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "email profile");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  // oauth2's native default is 16 random bytes (128 bits), encoded as 22
  // base64url characters. The TypeScript host uses 32 random bytes.
  assert.match(url.searchParams.get("state"), /^[A-Za-z0-9_-]{22,128}$/);
  assert.match(url.searchParams.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
  assert(fixture.redirectUris.includes(url.searchParams.get("redirect_uri")));
  return url.href;
}
export function validateRegistration(setup, registration) {
  assert.equal(setup.apiUrl, fixture.apiUrl);
  assert.equal(setup.editorOrigin, fixture.editorOrigin);
  assert.equal(registration.issuer, fixture.issuer);
  assert.equal(registration.apiOrigin, fixture.editorOrigin);
  assert.match(registration.publishableKey, /^sb_publishable_[A-Za-z0-9_-]+$/);
  assert.equal(registration.publishableKey, setup.publishableKey);
  assert.deepEqual(registration.redirectUris, fixture.redirectUris);
  assert.equal(typeof registration.clientId, "string");
  assert(registration.clientId.length > 0);
}

/** Bounded direct executable runner. No preload or application clock override. */
export function nativeCommand({
  executable,
  args,
  cwd,
  env,
  registration,
  timeoutMs = 90_000,
}) {
  const child = spawn(executable, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "",
    stderr = "",
    overflow = false;
  let resolveUrl, rejectUrl;
  const url = new Promise((resolve, reject) => {
    resolveUrl = resolve;
    rejectUrl = reject;
  });
  void url.catch(() => undefined);
  const collect = (channel, bytes) => {
    if (
      Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + bytes.length >
      65_536
    ) {
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
        resolveUrl(authorizationUrl(match[1], registration));
      } catch {
        rejectUrl(new Error("Invalid manual authorization destination"));
        child.kill("SIGTERM");
      }
    }
  };
  child.stdout.on("data", (bytes) => collect("stdout", bytes));
  child.stderr.on("data", (bytes) => collect("stderr", bytes));
  const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
  const hardTimer = setTimeout(() => child.kill("SIGKILL"), timeoutMs + 2_000);
  const done = new Promise((resolve, reject) => {
    child.once("error", () => {
      clearTimeout(timer);
      clearTimeout(hardTimer);
      rejectUrl(new Error("Login unavailable"));
      reject(new Error("Installed native process failed to start"));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      clearTimeout(hardTimer);
      rejectUrl(new Error("Login ended before producing an authorization URL"));
      if (overflow || signal || jwt.test(stdout + stderr)) {
        reject(
          new Error("Installed native output or lifetime contract failed")
        );
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
  void done.catch(() => undefined);
  return { child, url, done };
}

export async function proveNativeLocal({ statePath, candidate }) {
  assert(
    Number(process.versions.node.split(".")[0]) >= 24,
    "Node 24+ is required"
  );
  assert(
    path.isAbsolute(statePath) && path.isAbsolute(candidate),
    "State and candidate paths must be absolute"
  );
  assert(
    ["darwin", "linux"].includes(process.platform),
    "Native file custody proof requires macOS or Linux"
  );
  const state = await readState(statePath);
  assert.equal(state.phase, "bootstrapped");
  const setup = JSON.parse(await readFile(state.setupPath, "utf8"));
  const registration = JSON.parse(
    await readFile(state.publicClientPath, "utf8")
  );
  validateRegistration(setup, registration);
  const owned = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-native-oauth-"))
  );
  const runtime = path.join(owned, "installed"),
    home = path.join(owned, "home");
  const profiles = [path.join(owned, "first"), path.join(owned, "second")];
  const jobs = new Set(),
    listeners = new Set();
  let browser,
    installed,
    interrupted = false,
    blockedBrowserRequests = 0;
  const report = {
    passed: false,
    phase: "setup",
    runtime: process.version,
    platform: `${process.platform}/${process.arch}`,
    phases: [],
  };
  const env = {
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
  };
  const interrupt = () => {
    interrupted = true;
    for (const job of jobs) job.child.kill("SIGTERM");
    void browser?.close().catch(() => undefined);
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  async function phase(label, run) {
    assert(!interrupted, "Native fixture interrupted");
    report.phase = label;
    console.info(`[native-cli-proof] ${label}: start`);
    await run();
    report.phases.push(label);
    console.info(`[native-cli-proof] ${label}: passed`);
  }
  function command(args, profile = profiles[0], extra = {}) {
    assert(!interrupted, "Native fixture interrupted");
    const job = nativeCommand({
      executable: installed.executable,
      args,
      cwd: runtime,
      env: {
        ...env,
        GRIDA_HOME: profile,
        GRIDA_CLI_LOCAL_CONFIG: state.publicClientPath,
        ...extra,
      },
      registration,
    });
    jobs.add(job);
    void job.done.finally(() => jobs.delete(job)).catch(() => undefined);
    return job;
  }
  async function json(args, { code = 0, profile = profiles[0] } = {}) {
    const result = await command([...args, "--json", "--no-input"], profile)
      .done;
    assert.equal(result.code, code, "Unexpected native CLI exit status");
    return JSON.parse(result.stdout);
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
    if (server.listening)
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    listeners.delete(server);
  }
  async function login(profile, email) {
    await browser.clearCookies();
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);
    const job = command(
      ["auth", "login", "--storage", "file", "--no-browser"],
      profile
    );
    try {
      await page.goto(await job.url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      if (new URL(page.url()).pathname === "/insiders/auth/basic") {
        assert.equal(
          await page.locator('input[name="challenge"]').inputValue(),
          ""
        );
        const user = setup.users.find((value) => value.email === email);
        assert(user, "Expected seeded fixture user");
        await page.getByLabel("Email", { exact: true }).fill(user.email);
        await page.getByLabel("Password", { exact: true }).fill(user.password);
        await page
          .getByRole("button", { name: "Login", exact: true })
          .click({ noWaitAfter: true });
        await page.waitForURL(
          (value) =>
            value.pathname === "/oauth/consent" ||
            fixture.redirectUris.includes(value.origin + value.pathname),
          { waitUntil: "domcontentloaded" }
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
      assert.equal((await job.done).code, 0, "Native browser login failed");
    } finally {
      job.child.kill("SIGTERM");
      await page.close();
    }
  }
  async function cleared(profile, profileHash) {
    assert.match(profileHash, /^[0-9a-f]{64}$/);
    const value = JSON.parse(
      await readFile(
        path.join(profile, "auth", profileHash, "credentials.json"),
        "utf8"
      )
    );
    assert.equal(value.backend, "file");
    assert.equal(value.envelope.session, null);
    assert.match(value.envelope.revision, /^[0-9a-f-]{36}$/);
    assert(
      !jwt.test(JSON.stringify(value)),
      "Logout retained a bearer credential"
    );
    return value.envelope.revision;
  }
  try {
    for (const directory of [home, runtime, env.TMPDIR, ...profiles])
      await mkdir(directory, { recursive: true, mode: 0o700 });
    await phase("verified offline native candidate installation", async () => {
      installed = await installNative(candidate, runtime);
      assert(
        !installed.report.fixture_targets?.includes(installed.platform.id),
        "Selected host executable is an inert foreign fixture"
      );
      Object.assign(report, {
        version: installed.report.version,
        archive_sha256: installed.report.package.sha256,
        binary_sha256: installed.binary_sha256,
        candidate_kind: installed.report.fixture_targets?.length
          ? "host-only fixture; not publishable"
          : "release candidate",
      });
    });
    await phase("help, docs and noninteractive admission", async () => {
      for (const args of [
        ["--help"],
        ["--version"],
        ["docs"],
        ["docs", "account", "credits"],
      ]) {
        const result = await command(args, profiles[0], {
          GRIDA_CLI_LOCAL_CONFIG: "",
        }).done;
        assert.equal(result.code, 0);
        if (args[0] === "docs")
          assert.match(result.stdout, /^https:\/\/grida\.co\/[^\s]+\n$/);
      }
      assert.equal(
        (await json(["auth", "login"], { code: 1 })).error.code,
        "interaction_required"
      );
      assert.equal(
        (await json(["account", "credits", "--org-id", "0"], { code: 2 })).error
          .code,
        "invalid_usage"
      );
    });
    await phase("explicit file selection and restart", async () => {
      assert.equal(
        (await json(["auth", "storage", "show"])).backend,
        "keyring"
      );
      for (const profile of profiles) {
        assert.equal(
          (await json(["auth", "storage", "migrate", "file"], { profile }))
            .backend,
          "file"
        );
        assert.equal(
          (await json(["auth", "storage", "show"], { profile })).backend,
          "file"
        );
        assert.deepEqual(await json(["auth", "status"], { profile, code: 1 }), {
          state: "signed-out",
        });
      }
    });
    await phase(
      "occupied callback ports and cancellation cleanup",
      async () => {
        const ports = fixture.redirectUris.map((value) =>
          Number(new URL(value).port)
        );
        const occupied = [];
        try {
          for (const port of ports) occupied.push(await busy(port));
          const result = await command(["auth", "login", "--no-browser"]).done;
          assert.equal(result.code, 1);
          assert.match(result.stderr, /callback_unavailable/);
          assert(!result.stderr.includes("Open this URL"));
        } finally {
          await Promise.all(occupied.map(close));
        }
        const pending = command(["auth", "login", "--no-browser"]);
        await pending.url;
        pending.child.kill("SIGINT");
        const cancelled = await pending.done;
        assert.equal(cancelled.code, 1);
        assert.match(cancelled.stderr, /cancelled/);
        for (const port of ports) await close(await busy(port));
        assert.deepEqual(await json(["auth", "status"], { code: 1 }), {
          state: "signed-out",
        });
      }
    );
    const { chromium } = createRequire(
      path.join(repository, "editor/package.json")
    )("@playwright/test");
    browser = await chromium.launchPersistentContext(
      path.join(owned, "browser"),
      {
        headless: true,
        env,
        serviceWorkers: "block",
        args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
        ...(process.env.GRIDA_AUTH_TEST_BROWSER_EXECUTABLE
          ? { executablePath: process.env.GRIDA_AUTH_TEST_BROWSER_EXECUTABLE }
          : {}),
        timeout: 30_000,
      }
    );
    await browser.route("**/*", async (route) => {
      try {
        fixtureUrl(route.request().url());
      } catch {
        blockedBrowserRequests++;
        await route.abort();
        return;
      }
      await route.continue();
    });
    await browser.routeWebSocket("**/*", (socket) => {
      if (
        new URL(socket.url()).origin !==
        fixture.editorOrigin.replace(/^http:/, "ws:")
      ) {
        blockedBrowserRequests++;
        socket.close();
        return;
      }
      socket.connectToServer();
    });
    let firstAccount, secondAccount;
    await phase(
      "real browser consent and independent native profiles",
      async () => {
        await login(profiles[0], "insider@grida.co");
        const status = await json(["auth", "status"]);
        assert.equal(status.state, "signed-in");
        assert.equal(status.identity.email, "insider@grida.co");
        firstAccount = await json(["account", "view"]);
        assert.deepEqual(firstAccount.identity, status.identity);
        assert.deepEqual(
          firstAccount.organizations.map((value) => value.name),
          ["local"]
        );
        await login(profiles[1], "alice@acme.com");
        secondAccount = await json(["account", "view"], {
          profile: profiles[1],
        });
        assert.equal(secondAccount.identity.email, "alice@acme.com");
        assert.deepEqual(
          secondAccount.organizations.map((value) => value.name),
          ["acme"]
        );
        assert.notEqual(secondAccount.identity.id, firstAccount.identity.id);
      }
    );
    await phase(
      "restarted concurrent account reads and cached credits",
      async () => {
        const reads = await Promise.all(
          Array.from({ length: 3 }, () => json(["account", "view"]))
        );
        for (const read of reads) assert.deepEqual(read, firstAccount);
        const org = firstAccount.organizations[0];
        const credits = await json(["account", "credits"]);
        assert.deepEqual(credits.organization, org);
        assert.equal(credits.source, "cache");
        assert.equal(credits.currency, "USD");
        assert.deepEqual(
          await json(["account", "credits", "--org", org.name]),
          credits
        );
        assert.deepEqual(
          await json(["account", "credits", "--org-id", String(org.id)]),
          credits
        );
        assert.equal(
          (
            await json(["account", "credits", "--org-id", String(org.id)], {
              profile: profiles[1],
              code: 1,
            })
          ).error.code,
          "organization_not_found"
        );
      }
    );
    await phase(
      "session-local logout, durable clearing and independent survival",
      async () => {
        const storage = await json(["auth", "storage", "show"]);
        assert.deepEqual(await json(["auth", "logout"]), {
          state: "signed-out",
          revocation: "confirmed",
        });
        assert.deepEqual(await json(["auth", "status"], { code: 1 }), {
          state: "signed-out",
        });
        const revision = await cleared(profiles[0], storage.profile);
        assert.equal(
          (await json(["account", "view"], { code: 1 })).error.code,
          "signed_out"
        );
        assert.deepEqual(
          await json(["account", "view"], { profile: profiles[1] }),
          secondAccount
        );
        assert.deepEqual(await json(["auth", "logout"]), {
          state: "signed-out",
          revocation: "not-needed",
        });
        assert.notEqual(await cleared(profiles[0], storage.profile), revision);
        assert.equal(
          (await json(["auth", "logout"], { profile: profiles[1] })).revocation,
          "confirmed"
        );
      }
    );
    assert.equal(
      blockedBrowserRequests,
      0,
      "Browser attempted an unexpected origin"
    );
    report.passed = true;
    report.phase = "complete";
  } catch (error) {
    report.failure = {
      kind: error?.name === "AssertionError" ? "assertion" : "operation",
      location:
        typeof error?.stack === "string"
          ? (error.stack.match(/native-proof\.mjs:\d+:\d+/)?.[0] ?? null)
          : null,
    };
    throw new Error(
      "Native local OAuth proof failed; consult the safe phase report."
    );
  } finally {
    await Promise.allSettled([
      browser?.close(),
      ...[...listeners].map(close),
      ...[...jobs].map(async (job) => {
        job.child.kill("SIGTERM");
        const timer = setTimeout(() => job.child.kill("SIGKILL"), 2000);
        try {
          await job.done;
        } finally {
          clearTimeout(timer);
        }
      }),
    ]);
    await rm(owned, { recursive: true, force: true });
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await mkdir(path.dirname(reportPath), { recursive: true, mode: 0o700 });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
    });
  }
  return {
    passed: true,
    phases: report.phases.length,
    runtime: report.runtime,
    platform: report.platform,
    report: reportPath,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      options: { state: { type: "string" }, candidate: { type: "string" } },
    });
    assert(
      values.state && values.candidate,
      "Pass --state and --candidate absolute paths"
    );
    console.info(
      JSON.stringify(
        await proveNativeLocal({
          statePath: values.state,
          candidate: values.candidate,
        })
      )
    );
  } catch {
    console.error(
      "Native local OAuth proof failed. Raw process and browser diagnostics are withheld."
    );
    process.exitCode = 1;
  }
}
