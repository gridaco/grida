// GRIDA-SEC-010 / GRIDA-SEC-013 / GRIDA-SEC-015 — real installed executable,
// disposable local OAuth/account/GG endpoints, no Node network or clock preloads.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  realpath,
  rm,
} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  buildHostFixture,
  prepareHostFixture,
} from "../cli-release/native-fixture.mjs";
import { installNative } from "../cli-release/native-proof.mjs";

const identity = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "native-fixture@example.invalid",
  display_name: "Native fixture",
};
const organization = { id: 1, name: "fixture", display_name: "Fixture" };
const account = [
  { alg: "HS256", typ: "JWT" },
  {
    iss: "http://127.0.0.1:55431/auth/v1",
    aud: "authenticated",
    client_id: "native-fixture-client",
    sub: identity.id,
    session_id: "22222222-2222-4222-8222-222222222222",
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  "synthetic-signature",
]
  .map((v) =>
    Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString(
      "base64url"
    )
  )
  .join(".");
const refresh = "synthetic-native-refresh";
const grant = "synthetic.native.gg";
const png = Buffer.from("89504e470d0a1a0a", "hex");
const inputPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64"
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}
async function close(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
export async function proveInstalled({ binary, launcher, workdir }) {
  const owned = await realpath(
    await mkdtemp(path.join(workdir ?? tmpdir(), "grida-native-contract-"))
  );
  const home = path.join(owned, "home");
  await mkdir(home, { mode: 0o700 });
  const storage = path.join(owned, "grida");
  const registration = path.join(owned, "registration.json");
  await writeFile(
    registration,
    JSON.stringify({
      clientId: "native-fixture-client",
      publishableKey: "sb_publishable_fixture",
      issuer: "http://127.0.0.1:55431/auth/v1",
      apiOrigin: "http://127.0.0.1:3041",
      redirectUris: [
        "http://127.0.0.1:55435/callback",
        "http://127.0.0.1:55436/callback",
      ],
    }),
    { mode: 0o600 }
  );
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    GRIDA_HOME: storage,
    GRIDA_CLI_LOCAL_CONFIG: registration,
    NO_COLOR: "1",
    TERM: "dumb",
  };
  const command = launcher ? process.execPath : binary;
  const prefix = launcher ? [launcher] : [];
  let failure;
  const counts = new Map();
  let generationMode = "ok";
  let releaseResponse;
  let pendingResponse;
  let heldRoute;
  let routeReached;
  let releaseRoute;
  const respond = (res, value, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };
  const handler = async (req, res) => {
    try {
      counts.set(req.url, (counts.get(req.url) ?? 0) + 1);
      let bytes = Buffer.alloc(0);
      for await (const chunk of req) {
        bytes = Buffer.concat([bytes, chunk]);
        assert(bytes.length < 32 * 1024 * 1024);
      }
      if (heldRoute === req.url) {
        routeReached?.();
        await new Promise((resolve) => {
          releaseRoute = resolve;
        });
      }
      if (req.url === "/auth/v1/oauth/token") {
        assert.equal(req.method, "POST");
        const body = new URLSearchParams(bytes.toString());
        assert.equal(body.get("client_id"), "native-fixture-client");
        if (body.get("grant_type") === "authorization_code") {
          assert.equal(body.get("code"), "synthetic-code");
          assert.match(body.get("code_verifier"), /^[A-Za-z0-9_-]{43,128}$/);
        } else {
          assert.equal(body.get("grant_type"), "refresh_token");
          assert.equal(body.get("refresh_token"), refresh);
        }
        respond(res, {
          access_token: account,
          refresh_token: refresh,
          expires_in: 3600,
          token_type: "bearer",
        });
        return;
      }
      if (req.url === "/auth/v1/logout?scope=local") {
        assert.equal(req.headers.authorization, `Bearer ${account}`);
        assert.equal(req.headers.apikey, "sb_publishable_fixture");
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.url.startsWith("/api/v1/ai/")) {
        assert.equal(req.headers.authorization, `Bearer ${grant}`);
        assert.equal(req.method, "POST");
        const body = JSON.parse(bytes);
        if (req.url === "/api/v1/ai/images/generations") {
          assert.equal(body.model_id, "bfl/flux-2-pro");
          assert.equal(typeof body.prompt, "string");
          if (generationMode === "failure") {
            respond(res, { error: "synthetic failure" }, 503);
            return;
          }
          if (generationMode === "cancel") {
            pendingResponse?.();
            await new Promise((resolve) => {
              releaseResponse = resolve;
            });
            if (res.destroyed) return;
          }
          respond(res, {
            images: Array.from({ length: body.n ?? 1 }, () => ({
              base64: png.toString("base64"),
            })),
          });
          return;
        }
        throw new Error("Unexpected media route");
      }
      assert.equal(req.headers.authorization, `Bearer ${account}`);
      if (req.url === "/api/v1/auth/me") {
        respond(res, identity);
        return;
      }
      if (req.url === "/api/v1/account/organizations") {
        respond(res, { organizations: [organization], next_cursor: null });
        return;
      }
      if (req.url === "/api/v1/account/credits?organization_id=1") {
        respond(res, {
          organization,
          source: "cache",
          currency: "USD",
          account_present: true,
          state: "cached",
          balance_cents: 0,
          cache_updated_at: "2026-01-01T00:00:00.000Z",
          billing_gate: { allowed: true, reason: null },
        });
        return;
      }
      if (req.url === "/api/v1/auth/gg") {
        assert.deepEqual(JSON.parse(bytes), { organization_id: 1 });
        respond(res, {
          token: grant,
          expires_at: new Date(Date.now() + 600000).toISOString(),
          organization,
        });
        return;
      }
      throw new Error("Unexpected account route");
    } catch (e) {
      failure = e;
      respond(res, { error: "fixture_rejected" }, 500);
    }
  };
  const issuer = http.createServer(handler);
  const api = http.createServer(handler);
  const children = new Set();
  function start(argv, stdin = "") {
    const child = spawn(command, [...prefix, ...argv], {
      cwd: owned,
      env,
      stdio: "pipe",
    });
    children.add(child);
    child.stdin.end(stdin);
    let stdout = "",
      stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      stdout += c;
      assert(stdout.length < 1024 * 1024);
    });
    child.stderr.on("data", (c) => {
      stderr += c;
      assert(stderr.length < 65536);
    });
    let timer;
    const result = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Installed command timed out"));
      }, 15000);
      child.once("error", reject);
      child.once("close", (code, signal) => {
        clearTimeout(timer);
        children.delete(child);
        resolve({ code, signal, stdout, stderr });
      });
    });
    return { child, result, stderr: () => stderr };
  }
  async function run(argv, { stdin = "", exit = 0 } = {}) {
    const r = await start(argv, stdin).result;
    assert.equal(r.signal, null);
    assert.equal(r.code, exit, r.stderr || r.stdout);
    assert.equal(r.stderr, "");
    if (failure) throw failure;
    for (const secret of [account, refresh, grant])
      assert(!r.stdout.includes(secret));
    return argv.includes("--json") ? JSON.parse(r.stdout) : r.stdout;
  }
  const checks = [];
  async function cancelAt(route, argv) {
    heldRoute = route;
    const reached = new Promise((resolve) => {
      routeReached = resolve;
    });
    const operation = start(argv);
    await reached;
    operation.child.kill("SIGTERM");
    // The started request settles; the cancelled command must not begin its next step.
    await new Promise((resolve) => setTimeout(resolve, 100));
    releaseRoute();
    const result = await operation.result;
    heldRoute = undefined;
    assert.equal(result.code, 1);
    assert.equal(result.signal, null);
    assert.equal(JSON.parse(result.stdout).error.code, "cancelled");
    assert.equal(result.stderr, "");
  }

  try {
    await listen(issuer, 55431);
    await listen(api, 3041);
    assert.match(await run(["--version"]), /^grida /);
    checks.push("installed_version");
    const providerKey = "synthetic-elevenlabs-key";
    const configured = await run(
      ["providers", "configure", "elevenlabs", "--key-stdin", "--json"],
      { stdin: providerKey + "\n" }
    );
    assert.equal(configured.stored, true);
    assert.deepEqual(configured.verification, { status: "not_supported" });
    const providerState = async () =>
      (await run(["providers", "list", "--json"])).providers.find(
        (p) => p.provider === "elevenlabs"
      );
    assert.equal((await providerState()).source, "file");
    const storedBefore = await readFile(
      path.join(storage, "providers", "credentials.toml"),
      "utf8"
    );
    assert(storedBefore.includes(providerKey));
    assert.equal(
      (
        await run(
          ["providers", "configure", "elevenlabs", "--key-stdin", "--json"],
          { stdin: " \n", exit: 1 }
        )
      ).error.code,
      "invalid_credentials"
    );
    assert.equal(
      await readFile(
        path.join(storage, "providers", "credentials.toml"),
        "utf8"
      ),
      storedBefore
    );
    env.ELEVENLABS_API_KEY = "synthetic-env-key";
    assert.equal((await providerState()).source, "environment");
    await run(["providers", "remove", "elevenlabs", "--json"]);
    assert.equal((await providerState()).configured, true);
    delete env.ELEVENLABS_API_KEY;
    assert.equal((await providerState()).configured, false);
    assert(
      !String(
        await readFile(path.join(storage, "providers", "credentials.toml"))
      ).includes("synthetic-env-key")
    );
    assert.equal(counts.size, 0);
    checks.push("installed_provider_configure_precedence_remove");
    const initial = await run(["auth", "storage", "show", "--json"]);
    assert.equal(initial.backend, "keyring");
    assert.equal(initial.initialized, false);
    const info = await run(["auth", "storage", "migrate", "file", "--json"]);
    assert.equal(info.backend, "file");
    assert.equal(
      (await run(["auth", "status", "--json"], { exit: 1 })).state,
      "signed-out"
    );
    const login = start(["auth", "login", "--no-browser", "--storage", "file"]);
    const authorize = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("No authorization URL")),
        10000
      );
      const inspect = () => {
        const url = login
          .stderr()
          .match(
            /http:\/\/127\.0\.0\.1:55431\/auth\/v1\/oauth\/authorize[^\s]+/
          )?.[0];
        if (url) {
          clearTimeout(timer);
          resolve(new URL(url));
        }
      };
      login.child.stderr.on("data", inspect);
      login.result.then((r) => {
        if (r.code !== 0) {
          clearTimeout(timer);
          reject(new Error("Login exited before callback"));
        }
      });
      inspect();
    });
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    const callback = new URL(authorize.searchParams.get("redirect_uri"));
    callback.searchParams.set("code", "synthetic-code");
    callback.searchParams.set("state", authorize.searchParams.get("state"));
    const callbackResult = await fetch(callback, { redirect: "error" });
    assert.equal(callbackResult.status, 200);
    const signed = await login.result;
    assert.equal(signed.code, 0, signed.stderr);
    assert(!signed.stdout.includes(account));
    checks.push("installed_oauth_pkce_callback");
    assert.equal((await run(["auth", "status", "--json"])).state, "signed-in");
    assert.deepEqual((await run(["account", "view", "--json"])).organizations, [
      organization,
    ]);
    const credits = await run([
      "account",
      "credits",
      "--org-id",
      "1",
      "--json",
    ]);
    assert.equal(credits.balance_cents, 0);
    assert.equal(credits.account_present, true);
    checks.push("installed_account_and_zero_credits");
    await cancelAt("/api/v1/account/credits?organization_id=1", [
      "models",
      "list",
      "--provider",
      "gg",
      "--available",
      "--json",
    ]);
    const grantsBeforeCancellation = counts.get("/api/v1/auth/gg") ?? 0;
    await cancelAt("/api/v1/account/organizations", [
      "generate",
      "--provider",
      "gg",
      "--model",
      "bfl/flux-2-pro",
      "--prompt",
      "synthetic",
      "--out",
      "./cancel-before-grant",
      "--json",
    ]);
    assert.equal(counts.get("/api/v1/auth/gg") ?? 0, grantsBeforeCancellation);
    checks.push("installed_cancelled_read_prevents_grant");
    assert.equal(
      (
        await run([
          "models",
          "list",
          "--provider",
          "gg",
          "--available",
          "--json",
        ])
      ).access.eligible,
      true
    );
    // Malformed input and unsupported file claims cannot mint grants or submit.
    const before = counts.get("/api/v1/auth/gg") ?? 0;
    assert.equal(
      (
        await run(
          [
            "generate",
            "--provider",
            "gg",
            "--model",
            "bfl/flux-2-pro",
            "--input",
            "-",
            "--out",
            "./bad",
            "--json",
          ],
          { stdin: "{}", exit: 1 }
        )
      ).error.code,
      "invalid_input"
    );
    assert.equal(counts.get("/api/v1/auth/gg") ?? 0, before);
    checks.push("installed_preflight_before_grant");
    const generate = [
      "generate",
      "--provider",
      "gg",
      "--model",
      "bfl/flux-2-pro",
      "--prompt",
      "synthetic native input",
      "--out",
      "./image",
      "--json",
    ];
    const receipt = await run(generate);
    assert.equal(receipt.artifacts.length, 1);
    assert.equal(receipt.artifacts[0].sha256, sha(png));
    assert.deepEqual(await readFile(receipt.artifacts[0].path), png);
    assert(!JSON.stringify(receipt).includes("synthetic native input"));
    assert.deepEqual(
      JSON.parse(
        await readFile(path.join(receipt.directory, "receipt.json"), "utf8")
      ),
      receipt
    );
    checks.push("installed_gg_artifact_and_receipt");
    const submitted = counts.get("/api/v1/ai/images/generations");
    assert.equal(
      (await run(generate, { exit: 1 })).error.code,
      "output_unavailable"
    );
    assert.equal(counts.get("/api/v1/ai/images/generations"), submitted);
    checks.push("installed_no_overwrite_before_submission");
    await writeFile(path.join(owned, "image.png"), inputPng);
    env.OPENROUTER_API_KEY = " ";
    const referenced = await run(
      [
        "generate",
        "--provider",
        "openrouter",
        "--model",
        "bfl/flux-2-pro",
        "--prompt",
        "synthetic native input",
        "--reference",
        "./image.png",
        "--out",
        "./reference",
        "--json",
      ],
      { exit: 1 }
    );
    delete env.OPENROUTER_API_KEY;
    assert.equal(referenced.error.code, "invalid_credentials");
    checks.push("installed_local_image_preflight");
    generationMode = "failure";
    const failed = await run(
      generate.map((v) => (v === "./image" ? "./failed" : v)),
      { exit: 1 }
    );
    assert.equal(failed.error.code, "generation_failed");
    assert.equal(counts.get("/api/v1/ai/images/generations"), submitted + 1);
    checks.push("installed_no_paid_retry");
    generationMode = "cancel";
    const pending = new Promise((resolve) => {
      pendingResponse = resolve;
    });
    const cancel = start(
      generate.map((v) => (v === "./image" ? "./cancelled" : v))
    );
    await pending;
    cancel.child.kill("SIGTERM");
    const cancelled = await cancel.result;
    assert.equal(cancelled.code, 1);
    assert.equal(cancelled.signal, null);
    assert(
      ["aborted", "cancelled"].includes(JSON.parse(cancelled.stdout).error.code)
    );
    releaseResponse?.();
    checks.push("installed_signal_cancellation");
    const logout = await run(["auth", "logout", "--json"]);
    assert.equal(logout.revocation, "confirmed");
    assert.equal(
      (await run(["auth", "status", "--json"], { exit: 1 })).state,
      "signed-out"
    );
    checks.push("installed_logout_local_scope");
    if (failure) throw failure;
    return {
      passed: true,
      platform: `${process.platform}/${process.arch}`,
      checks,
      requests: Object.fromEntries(counts),
    };
  } finally {
    releaseResponse?.();
    releaseRoute?.();
    for (const child of children) child.kill("SIGKILL");
    await Promise.all([close(issuer), close(api)]);
    await rm(owned, { recursive: true, force: true });
  }
}
async function main() {
  const { values } = parseArgs({
    options: {
      binary: { type: "string" },
      candidate: { type: "string" },
      direct: { type: "boolean" },
      reference: { type: "boolean" },
    },
  });
  if (values.reference) {
    const { verifyBuild, referenceRoot } = await import("./baseline.mjs");
    await verifyBuild();
    process.stdout.write(
      JSON.stringify(
        {
          ...(await proveInstalled({
            launcher: path.join(
              referenceRoot,
              "packages/grida-cli/dist/bin.mjs"
            ),
          })),
          mode: "typescript-reference",
        },
        null,
        2
      ) + "\n"
    );
    return;
  }
  if (values.direct && values.binary) {
    process.stdout.write(
      JSON.stringify(
        {
          ...(await proveInstalled({ binary: values.binary })),
          mode: "direct-executable",
        },
        null,
        2
      ) + "\n"
    );
    return;
  }
  const owned = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-native-installed-"))
  );
  try {
    const candidate = values.candidate ?? path.join(owned, "candidate");
    if (!values.candidate) {
      if (values.binary) await prepareHostFixture(values.binary, candidate);
      else await buildHostFixture(candidate);
    }
    const installed = await installNative(
      candidate,
      path.join(owned, "runtime")
    );
    const report = await proveInstalled({
      ...(values.direct
        ? { binary: installed.executable }
        : { launcher: installed.launcher }),
      workdir: owned,
    });
    process.stdout.write(
      JSON.stringify(
        {
          ...report,
          mode: values.direct ? "direct-executable" : "npm-installed",
          binary_sha256: installed.binary_sha256,
          fixture_targets: installed.report.fixture_targets ?? [],
        },
        null,
        2
      ) + "\n"
    );
  } finally {
    await rm(owned, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
