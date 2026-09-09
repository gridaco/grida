// GRIDA-SEC-014 — shared provider custody retains explicit host authority.
// GRIDA-SEC-010 — hosted registration is inspected offline with disposable custody.
// GRIDA-SEC-013 — installed CLI media, synthetic provider sockets and owned GG HTTP.
// GRIDA-SEC-006 — distinct account/mint and scoped GG media routes; no durable GG token.
// GRIDA-GG: token — only synthetic grants enter this installed consumer proof.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { CliRelease } from "../cli-release/prepare.mjs";

const execute = promisify(execFile);
const repository = fileURLToPath(new URL("../../", import.meta.url));
const reportPath = path.join(repository, ".cache/cli-media-local/result.json");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const prompt = "A synthetic media fixture";
const keys = {
  openrouter: "sk-or-synthetic-openrouter-key-no-authority",
  vercel:
    "vck_syntheticVercelKeyNoAuthority0123456789abcdefghijklmnopqrstuvwxyz",
  fal: "synthetic-fal-id:synthetic-fal-secret-no-authority",
  elevenlabs: "synthetic-elevenlabs-key-no-authority",
};
const rejectedKey = "sk-or-synthetic-rejected-key-no-authority";
const accountToken = "synthetic-account-access";
const refreshToken = "synthetic-account-refresh";
const ggToken = "synthetic.gg.token";
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// Full local input container, unlike output signature stubs used for transport.
const localPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64"
);
const localImageUrl = `data:image/png;base64,${localPng.toString("base64")}`;
const referenceUrl =
  "https://public.example/reference.png?synthetic-input=private";
const speechText =
  "  안녕하세요, synthetic speech 🎨\r\nKeep these spaces.  \n";
const invalidImageText = "synthetic private input: this is not an image";
const mp3 = Buffer.from([73, 68, 51, 4, 0, 0]);
const mp4 = Buffer.from([0, 0, 0, 24]);
const glb = Buffer.from([103, 108, 84, 70, 2, 0, 0, 0, 12, 0, 0, 0]);
const identity = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "fixture@example.invalid",
  display_name: "Fixture",
};
const jsonBody = (value) => ({
  headers: { "content-type": "application/json" },
  base64: Buffer.from(JSON.stringify(value)).toString("base64"),
});
const binary = (value, type) => ({
  headers: { "content-type": type },
  base64: value.toString("base64"),
});
function assertInputAbsent(text) {
  for (const value of [
    prompt,
    speechText,
    referenceUrl,
    localPng.toString("base64"),
    invalidImageText,
  ])
    assert(
      !text.includes(value) &&
        !text.includes(JSON.stringify(value).slice(1, -1)),
      "Private input entered command output or receipt"
    );
}
function fixture(requests = [], dns = {}) {
  for (const request of requests)
    dns[request.hostname] ??= [{ address: "93.184.216.34", family: 4 }];
  return { requests, dns };
}
function queuedFalFixture(binding, input, result, bytes, type) {
  return fixture([
    {
      hostname: "queue.fal.run",
      path: `/${binding}`,
      method: "POST",
      headers: { authorization: `Key ${keys.fal}` },
      json: input,
      response: jsonBody({
        status_url: "https://queue.fal.run/job/status",
        response_url: "https://queue.fal.run/job/result",
      }),
    },
    {
      hostname: "queue.fal.run",
      path: "/job/status",
      method: "GET",
      headers: { authorization: `Key ${keys.fal}` },
      response: jsonBody({ status: "COMPLETED" }),
    },
    {
      hostname: "queue.fal.run",
      path: "/job/result",
      method: "GET",
      headers: { authorization: `Key ${keys.fal}` },
      response: jsonBody(result),
    },
    {
      hostname: "v3.fal.media",
      path: "/friendly-result",
      method: "GET",
      response: binary(bytes, type),
    },
  ]);
}
function registrationFixture(provider, key = keys[provider], response) {
  switch (provider) {
    case "openrouter":
      return fixture([
        {
          hostname: "openrouter.ai",
          path: "/api/v1/key",
          method: "GET",
          headers: { authorization: `Bearer ${key}` },
          response:
            response ?? jsonBody({ data: { is_management_key: false } }),
        },
      ]);
    case "vercel":
      return fixture([
        {
          hostname: "ai-gateway.vercel.sh",
          path: "/v1/credits",
          method: "GET",
          headers: { authorization: `Bearer ${key}` },
          response: response ?? jsonBody({ balance: "0", total_used: "0" }),
        },
      ]);
    case "fal":
      return fixture([
        {
          hostname: "api.fal.ai",
          path: "/v1/models/pricing?endpoint_id=fal-ai/flux/dev",
          method: "GET",
          headers: { authorization: `Key ${key}` },
          response:
            response ??
            jsonBody({
              prices: [
                {
                  endpoint_id: "fal-ai/flux/dev",
                  unit_price: 0.025,
                  unit: "image",
                  currency: "USD",
                },
              ],
              next_cursor: null,
              has_more: false,
            }),
        },
      ]);
    case "elevenlabs":
      return fixture();
    default:
      throw new Error("Unknown synthetic registration provider");
  }
}
async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    assert(
      !entry.isSymbolicLink(),
      "Owned artifact tree must not contain symlinks"
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
    "grida-ai",
    "grida-ai-models",
    "grida-auth",
    "grida-account",
    "grida-home",
  ]) {
    const root = path.join(repository, "packages", name);
    for (const filename of [
      path.join(root, "package.json"),
      ...(name === "grida-cli"
        ? [
            path.join(root, "README.md"),
            path.join(root, "THIRD-PARTY-NOTICES.txt"),
          ]
        : []),
      ...(await readdir(root))
        .filter((name) => /^tsdown\.config\.[cm]?ts$/.test(name))
        .map((name) => path.join(root, name)),
      ...(await files(path.join(root, "dist"))),
      ...(await files(path.join(root, "src"))),
    ]) {
      result[path.relative(repository, filename)] = sha256(
        await readFile(filename)
      );
    }
  }
  for (const filename of [
    ...(await files(path.join(repository, "scripts/cli-media-local"))),
    path.join(repository, "scripts/cli-local/network.cjs"),
    path.join(repository, "scripts/cli-local/network.test.mjs"),
    ...(await files(path.join(repository, "scripts/cli-release"))),
  ])
    result[path.relative(repository, filename)] = sha256(
      await readFile(filename)
    );
  return result;
}
async function main() {
  assert(Number(process.versions.node.split(".")[0]) >= 24, "Node24+ required");
  const { values } = parseArgs({ options: { archive: { type: "string" } } });
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
  const owned = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-cli-media-"))
  );
  const runtime = path.join(owned, "installed");
  const home = path.join(owned, "home");
  const profile = path.join(owned, "profile");
  const children = new Set();
  const report = {
    passed: false,
    phase: "setup",
    runtime: process.version,
    platform: `${process.platform}/${process.arch}`,
    cases: [],
  };
  const env = {
    PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(
      path.delimiter
    ),
    HOME: home,
    USERPROFILE: home,
    TMPDIR: path.join(owned, "tmp"),
    XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_CACHE_HOME: path.join(home, "cache"),
    CI: "1",
    NO_COLOR: "1",
    DO_NOT_TRACK: "1",
    TERM: "dumb",
    npm_config_userconfig: path.join(owned, "npmrc"),
    npm_config_globalconfig: path.join(owned, "global-npmrc"),
    npm_config_cache: path.join(owned, "npm-cache"),
  };
  let bin,
    server,
    interrupted = false,
    sequence = 0;
  const serverRequests = [];
  let serverViolation = false;
  const interrupt = () => {
    interrupted = true;
    for (const child of children) child.kill("SIGTERM");
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  async function check(name, run) {
    assert(!interrupted, "Proof interrupted");
    report.phase = name;
    console.info(`[cli-media] ${name}: start`);
    await run();
    assert(!serverViolation, "Synthetic server wire mismatch");
    report.cases.push(name);
    console.info(`[cli-media] ${name}: passed`);
  }
  async function startCommand(
    args,
    { wire = fixture(), extraEnv = {}, input, hosted = false } = {}
  ) {
    const id = sequence++;
    const fixturePath = path.join(owned, `fixture-${id}.json`);
    const baseReport = path.join(owned, `base-${id}.json`);
    const mediaReport = path.join(owned, `media-${id}.json`);
    await writeFile(fixturePath, JSON.stringify(wire), { mode: 0o600 });
    const child = spawn(
      process.execPath,
      ["--require", path.join(owned, "network.cjs"), bin, ...args],
      {
        cwd: runtime,
        env: {
          ...env,
          GRIDA_HOME: hosted ? undefined : profile,
          GRIDA_CLI_LOCAL_CONFIG: hosted
            ? undefined
            : path.join(owned, "public-client.json"),
          GRIDA_CLI_PROOF_ROOT: owned,
          GRIDA_CLI_PROOF_REPORT: baseReport,
          GRIDA_MEDIA_PROOF_FIXTURE: fixturePath,
          GRIDA_MEDIA_PROOF_REPORT: mediaReport,
          ...extraEnv,
          // Real TCP is unavailable until this run successfully owns3041.
          // Synthetic provider HTTPS/DNS remains independent of this switch.
          GRIDA_CLI_PROOF_OFFLINE: server?.listening ? "0" : "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    children.add(child);
    let stdout = "",
      stderr = "",
      overflow = false;
    let resolveUrl, resolveRequest;
    const authorization = new Promise((resolve) => {
      resolveUrl = resolve;
    });
    const requestStarted = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 45_000);
    const append = (lane, chunk) => {
      if (lane === "stdout") stdout += chunk;
      else stderr += chunk;
      if (stdout.length + stderr.length > 1024 * 1024) {
        overflow = true;
        child.kill("SIGKILL");
      }
      if (lane === "stderr") {
        if (stderr.includes("[synthetic-media] request accepted\n"))
          resolveRequest();
        const text = stderr.match(
          /Open this URL in your browser:\n([^\n]+)\n/
        )?.[1];
        if (text) {
          try {
            const url = new URL(text);
            assert.equal(
              url.origin + url.pathname,
              hosted
                ? "https://mozagqllybnbytfcmvdh.supabase.co/auth/v1/oauth/authorize"
                : "http://127.0.0.1:55431/auth/v1/oauth/authorize"
            );
            assert(!url.username && !url.password && !url.hash);
            resolveUrl(url);
          } catch {
            overflow = true;
            child.kill("SIGKILL");
          }
        }
      }
    };
    child.stdout.on("data", (chunk) => append("stdout", chunk));
    child.stderr.on("data", (chunk) => append("stderr", chunk));
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
    const done = new Promise((resolve, reject) => {
      child.once("error", () => reject(new Error("Owned CLI could not start")));
      child.once("close", async (code, signal) => {
        clearTimeout(timer);
        children.delete(child);
        try {
          assert(
            !overflow && !signal,
            "Owned CLI exceeded its output/time bound"
          );
          const base = JSON.parse(await readFile(baseReport, "utf8"));
          const stats = JSON.parse(await readFile(mediaReport, "utf8"));
          assert.equal(base.denied, 0, "Unexpected base authority attempt");
          assert.equal(
            stats.violations,
            0,
            "Synthetic assertions must never be hidden by safe CLI errors"
          );
          assert.equal(
            stats.requests.length,
            wire.requests.length,
            "Every configured provider request must occur exactly once"
          );
          for (const secret of [
            ...Object.values(keys),
            rejectedKey,
            accountToken,
            refreshToken,
            ggToken,
          ])
            assert(
              !(stdout + stderr).includes(secret),
              "Credential entered command output"
            );
          assertInputAbsent(stdout + stderr);
          resolve({ code, stdout, stderr, stats, base });
        } catch {
          reject(
            new Error("Installed CLI result or authority assertion failed")
          );
        }
      });
    });
    // Observe failures even when a manual-login caller is waiting for its URL.
    void done.catch(() => undefined);
    const urlResult = Promise.race([
      authorization,
      done.then(() => {
        throw new Error("Login ended before authorization URL");
      }),
    ]);
    void urlResult.catch(() => undefined);
    const requestResult = Promise.race([
      requestStarted,
      done.then(() => {
        throw new Error("Command ended before pending request");
      }),
    ]);
    void requestResult.catch(() => undefined);
    return {
      child,
      done,
      authorization: urlResult,
      requestStarted: requestResult,
    };
  }
  async function command(args, options, code = 0) {
    const result = await (await startCommand(args, options)).done;
    assert.equal(result.code, code, "Unexpected CLI status");
    return result;
  }
  async function json(args, options, code = 0) {
    const result = await command(
      [...args, "--json", "--no-input"],
      options,
      code
    );
    return { ...result, value: JSON.parse(result.stdout) };
  }
  async function generate({
    name,
    model,
    provider,
    kind,
    variant,
    value,
    wire,
    data,
    type,
    extraEnv = {},
    input,
    inputArgs,
  }) {
    let requestArgs = inputArgs;
    if (requestArgs === undefined) {
      const inputFile = path.join(owned, `input-${sequence}.json`);
      await writeFile(inputFile, JSON.stringify(value), { mode: 0o600 });
      requestArgs = ["--input", `@${inputFile}`];
    } else
      assert.equal(
        value,
        undefined,
        "Friendly and JSON inputs must remain exclusive"
      );
    const out = path.join(owned, `output-${name}`);
    const args = [
      "generate",
      "--model",
      model,
      "--provider",
      provider,
      ...requestArgs,
      "--out",
      out,
      ...(kind ? ["--kind", kind] : []),
      ...(variant ? ["--variant", variant] : []),
      ...(provider === "gg" ? ["--org-id", "42"] : []),
      ...(input ? ["--key-stdin"] : []),
    ];
    const result = await json(args, { wire, extraEnv, input });
    const receipt = result.value;
    assert.equal(receipt.model_id, model);
    assert.equal(receipt.provider_id, provider);
    assert.equal(receipt.directory, out);
    assert.equal(receipt.artifacts.length, 1);
    const artifact = receipt.artifacts[0];
    assert.equal(path.dirname(artifact.path), out);
    assert.equal(artifact.media_type, type);
    assert.equal(artifact.bytes, data.length);
    assert.equal(artifact.sha256, sha256(data));
    assert.deepEqual(await readFile(artifact.path), data);
    const saved = await files(out);
    assert.equal(saved.length, 2, "One artifact and one receipt only");
    const receiptFile = saved.find((value) => value.endsWith(".json"));
    assert.deepEqual(JSON.parse(await readFile(receiptFile, "utf8")), receipt);
    assertInputAbsent(JSON.stringify(receipt));
    assert.equal(result.stats.requests.length, wire?.requests.length ?? 0);
    return { out, args, result };
  }
  try {
    for (const directory of [
      runtime,
      home,
      profile,
      env.TMPDIR,
      path.join(owned, "archives"),
    ])
      await mkdir(directory, { recursive: true, mode: 0o700 });
    for (const filename of [
      env.npm_config_userconfig,
      env.npm_config_globalconfig,
    ])
      await writeFile(filename, "", { mode: 0o600 });
    await cp(
      path.join(repository, "scripts/cli-local/network.cjs"),
      path.join(owned, "auth-network.cjs")
    );
    await cp(
      fileURLToPath(new URL("./network.cjs", import.meta.url)),
      path.join(owned, "network.cjs")
    );
    await writeFile(
      path.join(owned, "public-client.json"),
      JSON.stringify({
        clientId: "synthetic-media-client",
        issuer: "http://127.0.0.1:55431/auth/v1",
        apiOrigin: "http://127.0.0.1:3041",
        redirectUris: [
          "http://127.0.0.1:55435/callback",
          "http://127.0.0.1:55436/callback",
        ],
      }),
      { mode: 0o600 }
    );
    report.sources = await sourceHashes();
    await check("offline packed installation", async () => {
      const npm = await CliRelease.npm();
      const options = {
        cwd: owned,
        env,
        timeout: 60_000,
        maxBuffer: 512 * 1024,
      };
      let archive;
      if (candidate) {
        archive = path.join(owned, "archives", "candidate.tgz");
        await writeFile(archive, candidate, { mode: 0o600 });
      } else {
        const directory = path.join(owned, "archives", "candidate");
        const record = await CliRelease.prepare(directory);
        archive = path.join(directory, record.archive);
      }
      report.archive_sha256 = sha256(await readFile(archive));
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
      assert.deepEqual(manifest.dependencies ?? {}, {});
      await files(installed);
      bin = await realpath(path.join(runtime, "node_modules/.bin/grida"));
      assert.equal(bin, path.resolve(installed, manifest.bin.grida));
      await assert.rejects(
        lstat(path.join(runtime, "node_modules/@github/keytar")),
        { code: "ENOENT" }
      );
      report.bin_sha256 = sha256(await readFile(bin));
    });

    // Cases are deliberately expressed in CLI syntax and provider wire fixtures,
    // with no import from a source file or test-only SDK/custody implementation.
    await check(
      "hosted registration and ordinary-home custody stay offline",
      async () => {
        const options = { hosted: true };
        const before = await json(["auth", "storage", "show"], options);
        assert.equal(before.value.backend, "keyring");
        assert.equal(before.value.initialized, false);
        await json(["auth", "storage", "migrate", "file"], options);
        const status = await json(["auth", "status"], options, 1);
        assert.deepEqual(status.value, { state: "signed-out" });
        const login = await startCommand(
          ["auth", "login", "--no-browser"],
          options
        );
        const authorization = await login.authorization;
        assert.equal(
          authorization.searchParams.get("client_id"),
          "ab2b3b01-a0a1-4d40-969c-b8fc177a2557"
        );
        assert.equal(authorization.searchParams.get("scope"), "email profile");
        assert.equal(
          authorization.searchParams.get("code_challenge_method"),
          "S256"
        );
        assert.match(
          authorization.searchParams.get("state"),
          /^[A-Za-z0-9_-]{43}$/
        );
        assert.match(
          authorization.searchParams.get("code_challenge"),
          /^[A-Za-z0-9_-]{43}$/
        );
        assert(
          [
            "http://127.0.0.1:55435/callback",
            "http://127.0.0.1:55436/callback",
          ].includes(authorization.searchParams.get("redirect_uri"))
        );
        // Do not navigate to this URL or send a code. No hosted request is allowed.
        login.child.kill("SIGTERM");
        const cancelled = await login.done;
        assert.equal(cancelled.code, 1);
        assert.match(cancelled.stderr, /Command interrupted/);
        const after = await json(["auth", "storage", "show"], options);
        assert.equal(after.value.profile, before.value.profile);
        assert.equal(after.value.backend, "file");
        const loggedOut = await json(["auth", "logout"], options);
        assert.deepEqual(loggedOut.value, {
          state: "signed-out",
          revocation: "not-needed",
        });
        for (const result of [before, status, cancelled, after, loggedOut]) {
          assert.deepEqual(result.base.requests, []);
          assert.deepEqual(result.stats.requests, []);
          assert.deepEqual(result.stats.dns, []);
          assert.equal(result.stats.token_exchanges, 0);
        }
        const credentials = JSON.parse(
          await readFile(
            path.join(
              home,
              ".grida",
              "auth",
              after.value.profile,
              "credentials.json"
            ),
            "utf8"
          )
        );
        assert.equal(credentials.binding.home, path.join(home, ".grida"));
        assert.equal(
          credentials.binding.issuer,
          "https://mozagqllybnbytfcmvdh.supabase.co/auth/v1"
        );
        assert.equal(
          credentials.binding.clientId,
          "ab2b3b01-a0a1-4d40-969c-b8fc177a2557"
        );
        assert.equal(credentials.binding.apiOrigin, "https://grida.co");
        assert.equal(credentials.envelope.session, null);
      }
    );

    await check("offline model discovery and schemas", async () => {
      const listed = await json(["models", "list"]);
      assert(Array.isArray(listed.value.operations));
      assert(listed.value.operations.length > 0);
      assert.deepEqual(listed.stats.requests, []);
      assert.deepEqual(listed.stats.dns, []);
      const local = await json([
        "models",
        "list",
        "--modality",
        "video",
        "--local-image",
      ]);
      assert.deepEqual(
        local.value.operations.map(
          ({ provider_id, model_id, local_image_flags }) => ({
            provider_id,
            model_id,
            local_image_flags,
          })
        ),
        [
          {
            provider_id: "fal",
            model_id: "google/veo-3.1-lite",
            local_image_flags: ["--image"],
          },
        ]
      );
      assert.deepEqual(local.stats.requests, []);
      assert.deepEqual(local.stats.dns, []);
      for (const [model, provider] of [
        ["openai/gpt-image-2", "openrouter"],
        ["eleven_text_to_sound_v2", "elevenlabs"],
        ["eleven_v3", "elevenlabs"],
        ["google/lyria-3", "gg"],
        ["fal-ai/trellis-2", "fal"],
      ]) {
        const inspected = await json([
          "models",
          "inspect",
          "--model",
          model,
          "--provider",
          provider,
        ]);
        assert.equal(inspected.value.model_id, model);
        assert.equal(inspected.value.provider_id, provider);
        assert.equal(inspected.value.input_schema.additionalProperties, false);
        assert.equal(inspected.value.input_schema.type, "object");
        assert.deepEqual(inspected.stats.requests, []);
        assert.deepEqual(inspected.stats.dns, []);
      }
    });
    await check(
      "local input support is discoverable from installed schemas",
      async () => {
        for (const [model, provider, variant, field] of [
          ["openai/gpt-image-2", "openrouter", "references", "references"],
          ["fal-ai/trellis-2", "fal", "image", "image"],
          ["google/veo-3.1-lite", "fal", "image", "image"],
        ]) {
          const inspected = await json([
            "models",
            "inspect",
            "--model",
            model,
            "--provider",
            provider,
            "--variant",
            variant,
          ]);
          assert.equal(inspected.value.variant, variant);
          const schema = inspected.value.input_schema;
          if (field === "references") {
            assert.equal(schema.properties.references.type, "array");
            assert.equal(
              schema.properties.references.maxItems,
              inspected.value.references_max
            );
            assert(schema.properties.references.maxItems >= 3);
          } else {
            assert.deepEqual(
              schema.properties.image.properties.media_type.enum,
              ["image/png", "image/jpeg", "image/webp"]
            );
            assert.equal(
              schema.properties.image.properties.data[
                "x-grida-decoded-max-bytes"
              ],
              model === "google/veo-3.1-lite" ? 8_000_000 : 8 * 1024 * 1024
            );
          }
          if (model === "google/veo-3.1-lite") {
            assert.equal(
              inspected.value.binding_id,
              "fal-ai/veo3.1/lite/image-to-video"
            );
            assert.deepEqual(schema.oneOf, [
              { required: ["image"] },
              { required: ["image_url"] },
            ]);
            assert.deepEqual(schema.properties.duration.enum, [4, 6, 8]);
            assert.equal(schema.properties.generate_audio.type, "boolean");
            assert(schema.properties.resolution.enum.includes("1280x720"));
          }
          assert.deepEqual(inspected.stats.requests, []);
          assert.deepEqual(inspected.stats.dns, []);
        }
      }
    );
    await check(
      "provider presence has no network or credential output",
      async () => {
        const result = await json(["providers", "list"], {
          extraEnv: { FAL_KEY: keys.fal },
        });
        assert(Array.isArray(result.value.providers));
        assert.equal(
          result.value.providers.find((entry) => entry.provider === "fal")
            .configured,
          true
        );
        assert.deepEqual(result.stats.requests, []);
        assert.deepEqual(result.stats.dns, []);
      }
    );
    await check(
      "registration checks once before shared BYOK survives restart",
      async () => {
        const configure = async (provider) => {
          const saved = await json(
            ["providers", "configure", provider, "--key-stdin"],
            { input: keys[provider], wire: registrationFixture(provider) }
          );
          assert.equal(saved.value.storage, "plaintext_file");
          assert.equal(saved.value.shared, true);
          assert.deepEqual(saved.value.verification, {
            status: provider === "elevenlabs" ? "not_supported" : "accepted",
          });
          assert.equal(
            saved.stats.requests.length,
            provider === "elevenlabs" ? 0 : 1
          );
          if (provider === "elevenlabs") assert.deepEqual(saved.stats.dns, []);
        };
        await configure("openrouter");
        await Promise.all(["vercel", "fal", "elevenlabs"].map(configure));
        const listed = await json(["providers", "list"]);
        assert.deepEqual(listed.stats.dns, []);
        for (const provider of Object.keys(keys)) {
          assert.equal(
            listed.value.providers.find((row) => row.provider === provider)
              .source,
            "file"
          );
          const available = await json([
            "models",
            "list",
            "--provider",
            provider,
            "--available",
          ]);
          assert.equal(available.value.access.source, "file");
          assert.deepEqual(available.stats.dns, []);
        }
      }
    );
    await check(
      "rejected registration never changes the saved key",
      async () => {
        const credentials = path.join(profile, "providers", "credentials.toml");
        const previous = await readFile(credentials);
        for (const [response, code] of [
          [
            { status: 401, ...jsonBody({ detail: rejectedKey }) },
            "credential_rejected",
          ],
          [
            { status: 403, ...jsonBody({ detail: rejectedKey }) },
            "access_denied",
          ],
          [
            { status: 429, ...jsonBody({ detail: rejectedKey }) },
            "unavailable",
          ],
          [
            jsonBody({ data: { is_management_key: "false" } }),
            "invalid_response",
          ],
        ]) {
          const result = await json(
            ["providers", "configure", "openrouter", "--key-stdin"],
            {
              input: rejectedKey,
              wire: registrationFixture("openrouter", rejectedKey, response),
            },
            1
          );
          assert.equal(result.value.error.code, code);
          assert.equal(result.stats.requests.length, 1);
          assert.deepEqual(await readFile(credentials), previous);
        }
      }
    );
    await check(
      "static credential rejection precedes every source's DNS",
      async () => {
        const credentials = path.join(profile, "providers", "credentials.toml");
        const previous = await readFile(credentials, "utf8");
        for (const [provider, environment, value] of [
          [
            "openrouter",
            "OPENROUTER_API_KEY",
            "synthetic-without-required-prefix",
          ],
          ["fal", "FAL_KEY", "synthetic-without-key-id-separator"],
          ["vercel", "AI_GATEWAY_API_KEY", "PASTE_VERCEL_AI_GATEWAY_KEY_HERE"],
          ["elevenlabs", "ELEVENLABS_API_KEY", "PASTE_ELEVENLABS_KEY_HERE"],
        ]) {
          const configured = await json(
            ["providers", "configure", provider, "--key-stdin"],
            { input: value },
            1
          );
          assert.equal(configured.value.error.code, "invalid_credentials");
          assert.deepEqual(configured.stats.dns, []);
          assert.equal(await readFile(credentials, "utf8"), previous);
          const args = [
            "models",
            "list",
            "--provider",
            provider,
            "--available",
          ];
          const fromEnvironment = await json(
            args,
            { extraEnv: { [environment]: value } },
            1
          );
          assert.equal(fromEnvironment.value.error.code, "invalid_credentials");
          assert.deepEqual(fromEnvironment.stats.dns, []);
          try {
            assert(
              previous.includes(keys[provider]),
              "Owned stored key must exist"
            );
            await writeFile(
              credentials,
              previous.replace(keys[provider], value),
              { mode: 0o600 }
            );
            const fromFile = await json(args, undefined, 1);
            assert.equal(fromFile.value.error.code, "invalid_credentials");
            assert.deepEqual(fromFile.stats.dns, []);
          } finally {
            await writeFile(credentials, previous, { mode: 0o600 });
          }
        }
      }
    );
    await check(
      "shared provider removal and explicit overrides never probe",
      async () => {
        await Promise.all(
          ["vercel", "fal", "elevenlabs"].map(async (provider) => {
            const removed = await json(["providers", "remove", provider]);
            assert(!Object.hasOwn(removed.value, "verification"));
            assert.deepEqual(removed.stats.dns, []);
          })
        );
        const credentials = path.join(profile, "providers", "credentials.toml");
        const previous = await readFile(credentials);
        try {
          await writeFile(credentials, "invalid TOML [", { mode: 0o600 });
          const override = await json(
            ["models", "list", "--provider", "fal", "--available"],
            { extraEnv: { FAL_KEY: keys.fal } }
          );
          assert.equal(override.value.access.source, "environment");
          assert.equal(await readFile(credentials, "utf8"), "invalid TOML [");
          const failed = await json(["providers", "list"], undefined, 1);
          assert.equal(failed.value.error.code, "invalid_store");
        } finally {
          await writeFile(credentials, previous, { mode: 0o600 });
        }
      }
    );
    await check(
      "OpenRouter image uses stored BYOK and writes bytes and a receipt",
      async () => {
        await generate({
          name: "image",
          model: "openai/gpt-image-2",
          provider: "openrouter",
          value: { prompt },
          wire: fixture([
            {
              hostname: "openrouter.ai",
              path: "/api/v1/images",
              method: "POST",
              headers: { authorization: `Bearer ${keys.openrouter}` },
              json: { model: "openai/gpt-image-2", prompt, n: 1 },
              response: jsonBody({
                data: [{ b64_json: png.toString("base64") }],
              }),
            },
          ]),
          data: png,
          type: "image/png",
        });
        await json(["providers", "remove", "openrouter"]);
        const removed = await json(["providers", "list"]);
        assert.equal(
          removed.value.providers.find((row) => row.provider === "openrouter")
            .configured,
          false
        );
      }
    );
    await check("Vercel image uses the pinned SDK protocol", async () => {
      await generate({
        name: "vercel-image",
        model: "openai/gpt-image-2",
        provider: "vercel",
        value: { prompt },
        extraEnv: { AI_GATEWAY_API_KEY: keys.vercel },
        wire: fixture([
          {
            hostname: "ai-gateway.vercel.sh",
            path: "/v3/ai/image-model",
            method: "POST",
            headers: {
              authorization: `Bearer ${keys.vercel}`,
              "ai-model-id": "openai/gpt-image-2",
              "ai-image-model-specification-version": "3",
            },
            json: { prompt, n: 1, providerOptions: {} },
            response: jsonBody({
              images: [png.toString("base64")],
              warnings: [],
            }),
          },
        ]),
        data: png,
        type: "image/png",
      });
    });
    await check("ElevenLabs SFX accepts explicit stdin key", async () => {
      await generate({
        name: "sfx",
        model: "eleven_text_to_sound_v2",
        provider: "elevenlabs",
        value: {
          prompt,
          duration_seconds: 1,
          loop: false,
          prompt_influence: 0,
        },
        input: keys.elevenlabs + "\n",
        wire: fixture([
          {
            hostname: "api.elevenlabs.io",
            path: "/v1/sound-generation?output_format=mp3_44100_128",
            method: "POST",
            headers: { "xi-api-key": keys.elevenlabs },
            json: {
              text: prompt,
              model_id: "eleven_text_to_sound_v2",
              duration_seconds: 1,
              loop: false,
              prompt_influence: 0,
            },
            response: binary(mp3, "audio/mpeg"),
          },
        ]),
        data: mp3,
        type: "audio/mpeg",
      });
    });
    await check(
      "ElevenLabs speech preserves text and encodes voice ID",
      async () => {
        await generate({
          name: "speech",
          model: "eleven_v3",
          provider: "elevenlabs",
          value: { text: "  Synthetic speech  ", voice_id: "voice/one" },
          extraEnv: { ELEVENLABS_API_KEY: keys.elevenlabs },
          wire: fixture([
            {
              hostname: "api.elevenlabs.io",
              path: "/v1/text-to-speech/voice%2Fone?output_format=mp3_44100_128",
              method: "POST",
              headers: { "xi-api-key": keys.elevenlabs },
              json: { text: "  Synthetic speech  ", model_id: "eleven_v3" },
              response: binary(mp3, "audio/mpeg"),
            },
          ]),
          data: mp3,
          type: "audio/mpeg",
        });
      }
    );
    await check(
      "voice discovery projects and sorts paginated account voices",
      async () => {
        const result = await json(
          ["voices", "list", "--provider", "elevenlabs"],
          {
            extraEnv: { ELEVENLABS_API_KEY: keys.elevenlabs },
            wire: fixture([
              {
                hostname: "api.elevenlabs.io",
                path: "/v2/voices?page_size=100",
                method: "GET",
                headers: { "xi-api-key": keys.elevenlabs },
                response: jsonBody({
                  voices: [
                    {
                      voice_id: "b",
                      name: "Zulu",
                      preview_url: "https://never-requested.invalid/private",
                    },
                  ],
                  has_more: true,
                  next_page_token: " cursor/one+ ",
                }),
              },
              {
                hostname: "api.elevenlabs.io",
                path: "/v2/voices?page_size=100&next_page_token=cursor%2Fone%2B",
                method: "GET",
                headers: { "xi-api-key": keys.elevenlabs },
                response: jsonBody({
                  voices: [
                    { voice_id: "a", name: "Alpha" },
                    { voice_id: "b", name: "Wrong duplicate" },
                  ],
                  has_more: false,
                }),
              },
            ]),
          }
        );
        assert.deepEqual(result.value, {
          provider: "elevenlabs",
          voices: [
            { voice_id: "a", name: "Alpha" },
            { voice_id: "b", name: "Zulu" },
          ],
        });
        assert.equal(result.stats.requests.length, 2);
      }
    );
    await check(
      "OpenRouter video polls and retrieves authenticated content",
      async () => {
        await generate({
          name: "video",
          model: "google/veo-3.1",
          provider: "openrouter",
          value: { prompt },
          extraEnv: { OPENROUTER_API_KEY: keys.openrouter },
          wire: fixture([
            {
              hostname: "openrouter.ai",
              path: "/api/v1/videos",
              method: "POST",
              headers: { authorization: `Bearer ${keys.openrouter}` },
              json: { model: "google/veo-3.1", prompt },
              response: jsonBody({ id: "synthetic-job" }),
            },
            {
              hostname: "openrouter.ai",
              path: "/api/v1/videos/synthetic-job",
              method: "GET",
              headers: { authorization: `Bearer ${keys.openrouter}` },
              response: jsonBody({ status: "completed" }),
            },
            {
              hostname: "openrouter.ai",
              path: "/api/v1/videos/synthetic-job/content?index=0",
              method: "GET",
              headers: { authorization: `Bearer ${keys.openrouter}` },
              response: binary(mp4, "video/mp4"),
            },
          ]),
          data: mp4,
          type: "video/mp4",
        });
      }
    );
    await check(
      "fal3D queues and downloads without a provider credential",
      async () => {
        await generate({
          name: "three-d",
          model: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
          provider: "fal",
          value: { prompt },
          extraEnv: { FAL_KEY: keys.fal },
          wire: fixture([
            {
              hostname: "queue.fal.run",
              path: "/fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
              method: "POST",
              headers: { authorization: `Key ${keys.fal}` },
              json: { prompt },
              response: jsonBody({
                status_url: "https://queue.fal.run/job/status",
                response_url: "https://queue.fal.run/job/result",
              }),
            },
            {
              hostname: "queue.fal.run",
              path: "/job/status",
              method: "GET",
              headers: { authorization: `Key ${keys.fal}` },
              response: jsonBody({ status: "COMPLETED" }),
            },
            {
              hostname: "queue.fal.run",
              path: "/job/result",
              method: "GET",
              headers: { authorization: `Key ${keys.fal}` },
              response: jsonBody({
                model_glb: { url: "https://v3.fal.media/model.glb" },
              }),
            },
            {
              hostname: "v3.fal.media",
              path: "/model.glb",
              method: "GET",
              response: binary(glb, "model/gltf-binary"),
            },
          ]),
          data: glb,
          type: "model/gltf-binary",
        });
      }
    );
    for (const [name, model, field] of [
      [
        "hunyuan-image",
        "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
        "input_image_url",
      ],
      ["trellis", "fal-ai/trellis-2", "image_url"],
    ]) {
      await check(`${name} retains its exact3D input contract`, async () => {
        await generate({
          name,
          model,
          provider: "fal",
          value: {
            image: { data: png.toString("base64"), media_type: "image/png" },
          },
          extraEnv: { FAL_KEY: keys.fal },
          wire: fixture([
            {
              hostname: "queue.fal.run",
              path: `/${model}`,
              method: "POST",
              headers: { authorization: `Key ${keys.fal}` },
              json: {
                [field]: `data:image/png;base64,${png.toString("base64")}`,
              },
              response: jsonBody({
                status_url: "https://queue.fal.run/job/status",
                response_url: "https://queue.fal.run/job/result",
              }),
            },
            {
              hostname: "queue.fal.run",
              path: "/job/status",
              method: "GET",
              headers: { authorization: `Key ${keys.fal}` },
              response: jsonBody({ status: "COMPLETED" }),
            },
            {
              hostname: "queue.fal.run",
              path: "/job/result",
              method: "GET",
              headers: { authorization: `Key ${keys.fal}` },
              response: jsonBody({
                model_glb: { url: "https://v3.fal.media/model.glb" },
              }),
            },
            {
              hostname: "v3.fal.media",
              path: "/model.glb",
              method: "GET",
              response: binary(glb, "model/gltf-binary"),
            },
          ]),
          data: glb,
          type: "model/gltf-binary",
        });
      });
    }

    const localImageFile = path.join(runtime, "reference-input.jpg");
    const textFile = path.join(runtime, "speech-input.txt");
    await writeFile(localImageFile, localPng, { mode: 0o600 });
    await writeFile(textFile, speechText, { mode: 0o600 });
    await check(
      "friendly references preserve local and HTTPS order and match JSON",
      async () => {
        const references = [localImageUrl, referenceUrl, localImageUrl];
        for (const [name, request] of [
          [
            "references-flags",
            {
              inputArgs: [
                "--prompt",
                prompt,
                "--reference",
                "./reference-input.jpg",
                "--reference",
                referenceUrl,
                "--reference",
                "./reference-input.jpg",
              ],
            },
          ],
          [
            "references-json",
            { value: { prompt, references }, variant: "references" },
          ],
        ]) {
          const generated = await generate({
            name,
            model: "openai/gpt-image-2",
            provider: "openrouter",
            ...request,
            extraEnv: { OPENROUTER_API_KEY: keys.openrouter },
            wire: fixture([
              {
                hostname: "openrouter.ai",
                path: "/api/v1/images",
                method: "POST",
                headers: { authorization: `Bearer ${keys.openrouter}` },
                json: {
                  model: "openai/gpt-image-2",
                  prompt,
                  n: 1,
                  input_references: references.map((url) => ({
                    type: "image_url",
                    image_url: { url },
                  })),
                },
                response: jsonBody({
                  data: [{ b64_json: png.toString("base64") }],
                }),
              },
            ]),
            data: png,
            type: "image/png",
          });
          assert.equal(generated.result.value.variant, "references");
          assert.deepEqual(generated.result.stats.dns, ["openrouter.ai"]);
        }
      }
    );
    await check(
      "friendly local image reaches TRELLIS bytes without JSON",
      async () => {
        const generated = await generate({
          name: "trellis-local",
          model: "fal-ai/trellis-2",
          provider: "fal",
          inputArgs: ["--image", "./reference-input.jpg"],
          extraEnv: { FAL_KEY: keys.fal },
          wire: queuedFalFixture(
            "fal-ai/trellis-2",
            { image_url: localImageUrl },
            { model_glb: { url: "https://v3.fal.media/friendly-result" } },
            glb,
            "model/gltf-binary"
          ),
          data: glb,
          type: "model/gltf-binary",
        });
        assert.equal(generated.result.value.variant, "image");
      }
    );
    await check(
      "friendly SFX scalar flags preserve false and zero",
      async () => {
        await generate({
          name: "sfx-flags",
          model: "eleven_text_to_sound_v2",
          provider: "elevenlabs",
          inputArgs: [
            "--prompt",
            prompt,
            "--param",
            "duration_seconds=1",
            "--param",
            "loop=false",
            "--param",
            "prompt_influence=0",
          ],
          extraEnv: { ELEVENLABS_API_KEY: keys.elevenlabs },
          wire: fixture([
            {
              hostname: "api.elevenlabs.io",
              path: "/v1/sound-generation?output_format=mp3_44100_128",
              method: "POST",
              headers: { "xi-api-key": keys.elevenlabs },
              json: {
                text: prompt,
                model_id: "eleven_text_to_sound_v2",
                duration_seconds: 1,
                loop: false,
                prompt_influence: 0,
              },
              response: binary(mp3, "audio/mpeg"),
            },
          ]),
          data: mp3,
          type: "audio/mpeg",
        });
      }
    );
    await check(
      "friendly speech reads exact UTF-8 text and encodes its voice",
      async () => {
        await generate({
          name: "speech-file",
          model: "eleven_v3",
          provider: "elevenlabs",
          inputArgs: [
            "--text-file",
            "./speech-input.txt",
            "--voice",
            "voice/one",
          ],
          extraEnv: { ELEVENLABS_API_KEY: keys.elevenlabs },
          wire: fixture([
            {
              hostname: "api.elevenlabs.io",
              path: "/v1/text-to-speech/voice%2Fone?output_format=mp3_44100_128",
              method: "POST",
              headers: { "xi-api-key": keys.elevenlabs },
              json: { text: speechText, model_id: "eleven_v3" },
              response: binary(mp3, "audio/mpeg"),
            },
          ]),
          data: mp3,
          type: "audio/mpeg",
        });
      }
    );
    await check(
      "fal Veo Lite local image uses exact inline and scalar wire values",
      async () => {
        const generated = await generate({
          name: "veo-lite-local",
          model: "google/veo-3.1-lite",
          provider: "fal",
          inputArgs: [
            "--prompt",
            prompt,
            "--image",
            "./reference-input.jpg",
            "--param",
            "duration=4",
            "--param",
            "resolution=1280x720",
            "--param",
            "generate_audio=false",
          ],
          extraEnv: { FAL_KEY: keys.fal },
          wire: queuedFalFixture(
            "fal-ai/veo3.1/lite/image-to-video",
            {
              prompt,
              image_url: localImageUrl,
              duration: "4s",
              resolution: "720p",
              aspect_ratio: "16:9",
              generate_audio: false,
            },
            { video: { url: "https://v3.fal.media/friendly-result" } },
            mp4,
            "video/mp4"
          ),
          data: mp4,
          type: "video/mp4",
        });
        assert.equal(generated.result.value.variant, "image");
        assert.equal(
          generated.result.value.binding_id,
          "fal-ai/veo3.1/lite/image-to-video"
        );
      }
    );
    await check(
      "local input and flag failures precede DNS and output creation",
      async () => {
        const malformed = path.join(runtime, "malformed-private.png");
        const oversized = path.join(runtime, "oversized-private.png");
        await writeFile(malformed, invalidImageText, { mode: 0o600 });
        const bytes = Buffer.alloc(8 * 1024 * 1024 + 1);
        localPng.copy(bytes);
        await writeFile(oversized, bytes, { mode: 0o600 });
        for (const [name, model, inputArgs] of [
          [
            "URL-only-video",
            "google/veo-3.1",
            ["--prompt", prompt, "--image", "./reference-input.jpg"],
          ],
          [
            "missing-file",
            "openai/gpt-image-2",
            ["--prompt", prompt, "--reference", "./missing-private.png"],
          ],
          [
            "malformed-image",
            "openai/gpt-image-2",
            ["--prompt", prompt, "--reference", "./malformed-private.png"],
          ],
          [
            "oversized-image",
            "openai/gpt-image-2",
            ["--prompt", prompt, "--reference", "./oversized-private.png"],
          ],
          [
            "duplicate-flags",
            "openai/gpt-image-2",
            ["--prompt", prompt, "--prompt", prompt],
          ],
        ]) {
          const out = path.join(owned, `never-${name}`);
          const result = await json(
            [
              "generate",
              "--provider",
              "openrouter",
              "--model",
              model,
              ...inputArgs,
              "--out",
              out,
            ],
            { extraEnv: { OPENROUTER_API_KEY: keys.openrouter } },
            2
          );
          assert.equal(result.value.error.code, "invalid_usage");
          assert.deepEqual(result.stats.requests, []);
          assert.deepEqual(result.stats.dns, []);
          await assert.rejects(lstat(out), { code: "ENOENT" });
        }
        const out = path.join(owned, "occupied-friendly-output");
        await mkdir(out, { mode: 0o700 });
        await writeFile(path.join(out, "sentinel"), "preserve");
        const result = await json(
          [
            "generate",
            "--provider",
            "openrouter",
            "--model",
            "openai/gpt-image-2",
            "--prompt",
            prompt,
            "--reference",
            "./reference-input.jpg",
            "--out",
            out,
          ],
          { extraEnv: { OPENROUTER_API_KEY: keys.openrouter } },
          1
        );
        assert.equal(result.value.error.code, "output_unavailable");
        assert.deepEqual(result.stats.requests, []);
        assert.deepEqual(result.stats.dns, []);
        assert.equal(
          await readFile(path.join(out, "sentinel"), "utf8"),
          "preserve"
        );
      }
    );

    await check(
      "invalid inputs and occupied outputs fail before authority",
      async () => {
        const inputFile = path.join(owned, "invalid-input.json");
        const out = path.join(owned, "never-created");
        await writeFile(
          inputFile,
          JSON.stringify({
            prompt,
            providerOptions: { api_key: "rejected-input" },
          })
        );
        const args = [
          "generate",
          "--provider",
          "openrouter",
          "--model",
          "openai/gpt-image-2",
          "--input",
          `@${inputFile}`,
          "--out",
          out,
        ];
        let result = await json(
          args,
          { extraEnv: { OPENROUTER_API_KEY: keys.openrouter } },
          1
        );
        assert.equal(result.value.error.code, "invalid_input");
        assert.deepEqual(result.stats.requests, []);
        assert.deepEqual(result.stats.dns, []);
        await assert.rejects(lstat(out), { code: "ENOENT" });
        await writeFile(inputFile, JSON.stringify({ prompt }));
        result = await json(args, undefined, 1);
        assert.equal(result.value.error.code, "provider_unavailable");
        assert.deepEqual(result.stats.requests, []);
        assert.deepEqual(result.stats.dns, []);
        await assert.rejects(lstat(out), { code: "ENOENT" });
        await mkdir(out);
        await writeFile(path.join(out, "sentinel"), "preserve");
        result = await json(
          args,
          { extraEnv: { OPENROUTER_API_KEY: keys.openrouter } },
          1
        );
        assert.equal(result.value.error.code, "output_unavailable");
        assert.deepEqual(result.stats.requests, []);
        assert.deepEqual(result.stats.dns, []);
        assert.equal(
          await readFile(path.join(out, "sentinel"), "utf8"),
          "preserve"
        );
      }
    );
    await check(
      "HTTP access denial remains safe without retry or artifacts",
      async () => {
        const inputFile = path.join(owned, "speech-denied.json");
        const out = path.join(owned, "speech-denied");
        await writeFile(
          inputFile,
          JSON.stringify({ text: "synthetic", voice_id: "voice" })
        );
        const result = await json(
          [
            "generate",
            "--provider",
            "elevenlabs",
            "--model",
            "eleven_v3",
            "--input",
            `@${inputFile}`,
            "--out",
            out,
          ],
          {
            extraEnv: { ELEVENLABS_API_KEY: keys.elevenlabs },
            wire: fixture([
              {
                hostname: "api.elevenlabs.io",
                path: "/v1/text-to-speech/voice?output_format=mp3_44100_128",
                method: "POST",
                headers: { "xi-api-key": keys.elevenlabs },
                json: { text: "synthetic", model_id: "eleven_v3" },
                response: {
                  status: 403,
                  headers: { "content-length": String(512 * 1024 * 1024) },
                },
              },
            ]),
          },
          1
        );
        assert.equal(result.value.error.code, "provider_access_denied");
        assert.equal(result.stats.requests.length, 1);
        await assert.rejects(lstat(out), { code: "ENOENT" });
      }
    );
    await check(
      "interrupting a submitted job does not retry or leave artifacts",
      async () => {
        const inputFile = path.join(owned, "pending.json");
        const out = path.join(owned, "pending-output");
        await writeFile(inputFile, JSON.stringify({ prompt }));
        const pending = await startCommand(
          [
            "generate",
            "--provider",
            "openrouter",
            "--model",
            "openai/gpt-image-2",
            "--input",
            `@${inputFile}`,
            "--out",
            out,
            "--json",
            "--no-input",
          ],
          {
            extraEnv: { OPENROUTER_API_KEY: keys.openrouter },
            wire: fixture([
              {
                hostname: "openrouter.ai",
                path: "/api/v1/images",
                method: "POST",
                headers: { authorization: `Bearer ${keys.openrouter}` },
                json: { model: "openai/gpt-image-2", prompt, n: 1 },
                pending: true,
              },
            ]),
          }
        );
        await pending.requestStarted;
        pending.child.kill("SIGTERM");
        const result = await pending.done;
        assert.equal(result.code, 1);
        assert.equal(JSON.parse(result.stdout).error.code, "aborted");
        assert.equal(result.stats.requests.length, 1);
        assert.equal(result.stats.destroyed, 1);
        await assert.rejects(lstat(out), { code: "ENOENT" });
      }
    );

    await check(
      "native file custody and GG music use distinct real loopback routes",
      async () => {
        server = http.createServer(async (request, response) => {
          try {
            const url = new URL(request.url, "http://127.0.0.1:3041");
            const chunks = [];
            let size = 0;
            for await (const chunk of request) {
              size += chunk.length;
              assert(size <= 8192);
              chunks.push(chunk);
            }
            const body = size
              ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
              : undefined;
            let result;
            if (url.pathname.startsWith("/api/v1/ai/")) {
              assert.equal(request.method, "POST");
              assert.equal(request.headers.authorization, `Bearer ${ggToken}`);
              if (url.pathname === "/api/v1/ai/music/generations") {
                assert.deepEqual(body, {
                  model_id: "google/lyria-3",
                  prompt,
                  seed: 0,
                });
                result = {
                  model_id: "google/lyria-3",
                  provider_id: "gg",
                  audio: {
                    base64: mp3.toString("base64"),
                    media_type: "audio/mpeg",
                    file_name: "untrusted-provider-name.mp3",
                  },
                };
              } else if (url.pathname === "/api/v1/ai/images/generations") {
                assert.deepEqual(body, {
                  model_id: "openai/gpt-image-2",
                  prompt,
                  n: 1,
                });
                result = {
                  images: [
                    { base64: png.toString("base64"), media_type: "image/png" },
                  ],
                };
              } else {
                assert.equal(url.pathname, "/api/v1/ai/videos/generations");
                assert.deepEqual(body, { model_id: "google/veo-3.1", prompt });
                result = {
                  videos: [
                    { base64: mp4.toString("base64"), media_type: "video/mp4" },
                  ],
                };
              }
            } else {
              assert.equal(
                request.headers.authorization,
                `Bearer ${accountToken}`
              );
              if (url.pathname === "/api/v1/auth/me") {
                assert.equal(request.method, "GET");
                result = identity;
              } else if (url.pathname === "/api/v1/account/organizations") {
                assert.equal(request.method, "GET");
                result = {
                  organizations: [
                    { id: 42, name: "fixture", display_name: "Fixture" },
                  ],
                  next_cursor: null,
                };
              } else {
                assert.equal(url.pathname, "/api/v1/auth/gg");
                assert.equal(request.method, "POST");
                assert.deepEqual(body, { organization_id: 42 });
                result = {
                  token: ggToken,
                  expires_at: new Date(Date.now() + 600_000).toISOString(),
                  organization: { id: 42, name: "fixture" },
                };
              }
            }
            serverRequests.push({ method: request.method, path: url.pathname });
            response.writeHead(200, {
              "content-type": "application/json",
              "cache-control": "no-store",
            });
            response.end(JSON.stringify(result));
          } catch {
            serverViolation = true;
            response.writeHead(500);
            response.end();
          }
        });
        server.requestTimeout = 10_000;
        server.headersTimeout = 10_000;
        await new Promise((resolve, reject) => {
          server.once("error", reject);
          server.listen(3041, "127.0.0.1", resolve);
        });
        const login = await startCommand([
          "auth",
          "login",
          "--storage",
          "file",
          "--no-browser",
        ]);
        const authorization = await login.authorization;
        const callback = new URL(
          authorization.searchParams.get("redirect_uri")
        );
        assert(
          [
            "http://127.0.0.1:55435/callback",
            "http://127.0.0.1:55436/callback",
          ].includes(callback.href)
        );
        callback.searchParams.set("code", "synthetic-media-code");
        callback.searchParams.set(
          "state",
          authorization.searchParams.get("state")
        );
        const result = await fetch(callback, {
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        });
        assert.equal(result.status, 200);
        await result.arrayBuffer();
        assert.equal((await login.done).code, 0);
        for (const name of ["music", "music-restart"])
          await generate({
            name,
            model: "google/lyria-3",
            provider: "gg",
            value: { prompt, seed: 0 },
            wire: fixture(),
            data: mp3,
            type: "audio/mpeg",
          });
        await generate({
          name: "gg-image",
          model: "openai/gpt-image-2",
          provider: "gg",
          value: { prompt },
          wire: fixture(),
          data: png,
          type: "image/png",
        });
        await generate({
          name: "gg-video",
          model: "google/veo-3.1",
          provider: "gg",
          value: { prompt },
          wire: fixture(),
          data: mp4,
          type: "video/mp4",
        });
        assert.equal(
          serverRequests.filter((value) => value.path === "/api/v1/auth/gg")
            .length,
          4,
          "Each process obtains a fresh scoped grant"
        );
        const before = serverRequests.length;
        const inputFile = path.join(owned, "gg-preflight.json");
        const out = path.join(owned, "gg-preflight-output");
        const args = [
          "generate",
          "--provider",
          "gg",
          "--model",
          "google/lyria-3",
          "--org-id",
          "42",
          "--input",
          `@${inputFile}`,
          "--out",
          out,
        ];
        await writeFile(
          inputFile,
          JSON.stringify({ prompt, unsupported: true })
        );
        assert.equal(
          (await json(args, undefined, 1)).value.error.code,
          "invalid_input"
        );
        await writeFile(inputFile, JSON.stringify({ prompt }));
        await mkdir(out);
        assert.equal(
          (await json(args, undefined, 1)).value.error.code,
          "output_unavailable"
        );
        assert.equal(
          serverRequests.length,
          before,
          "GG preflight must precede account reads and scoped mint"
        );
        const stateFiles = await files(profile);
        for (const filename of stateFiles)
          assert(
            !(await readFile(filename)).includes(Buffer.from(ggToken)),
            "GG token must not enter durable custody"
          );
      }
    );
    assert.deepEqual(
      await sourceHashes(),
      report.sources,
      "Source/artifact changed during proof"
    );
    report.server_requests = serverRequests;
    report.passed = true;
  } finally {
    for (const child of children) child.kill("SIGTERM");
    await Promise.allSettled(
      [...children].map(
        (child) =>
          new Promise((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) {
              resolve();
              return;
            }
            const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
            child.once("close", () => {
              clearTimeout(timer);
              resolve();
            });
          })
      )
    );
    // A listener cleanup error must not skip removal of private fixture files.
    const cleanups = await Promise.allSettled([
      (async () => {
        if (server) {
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        }
      })(),
      rm(owned, { recursive: true, force: true }),
    ]);
    const cleaned = cleanups.every((value) => value.status === "fulfilled");
    report.cleanup = { owned_resources_removed: cleaned };
    report.passed &&= cleaned;
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
    });
    assert(cleaned, "Owned fixture cleanup failed");
  }
  console.info(
    "Installed synthetic CLI media proof passed; owned resources removed."
  );
}
main().catch(() => {
  console.error(
    "Installed CLI media proof failed; inspect its safe local report."
  );
  process.exitCode = 1;
});
