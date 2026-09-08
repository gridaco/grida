// GRIDA-SEC-014 — custody may use only private lock databases after media startup.
// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-SEC-008 — built media startup and lightweight host exports.
// GRIDA-GG: provider — synthetic transport proves scoped custody without agent startup.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
let stage: string;

// This proves startup independence, not installation independence: the private
// package keeps its declared dependencies. Fresh production-config output uses
// actual package exports; dependency links only supply the installed closure.
beforeAll(async () => {
  stage = await fs.mkdtemp(path.join(os.tmpdir(), "grida-media-entry-"));
  await fs.mkdir(path.join(stage, "home"));
  await fs.copyFile(
    path.join(packageRoot, "package.json"),
    path.join(stage, "package.json")
  );
  await fs.symlink(
    path.join(packageRoot, "node_modules"),
    path.join(stage, "node_modules"),
    "dir"
  );
  await execute(
    process.execPath,
    [
      path.join(packageRoot, "../../node_modules/tsdown/dist/run.mjs"),
      "--out-dir",
      path.join(stage, "dist"),
    ],
    {
      cwd: packageRoot,
      timeout: 90_000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        PATH: process.env.PATH,
        HOME: path.join(stage, "home"),
        TMPDIR: stage,
        NODE_ENV: "production",
      },
    }
  );
  await fs.writeFile(path.join(stage, "probe.mjs"), probe);
}, 100_000);

afterAll(async () => {
  if (stage) await fs.rm(stage, { recursive: true, force: true });
});

/** Inspect only chunks reachable from this entry, not deliberately built agent entries. */
async function assertMediaClosure(entry: string): Promise<void> {
  const visited = new Set<string>();
  async function visit(filename: string): Promise<void> {
    if (visited.has(filename)) return;
    visited.add(filename);
    const source = await fs.readFile(filename, "utf8");
    expect(source).not.toMatch(
      /#region src\/(?:runtime|session|skills|agent-provider|acp|tools)\//
    );
    expect(source).not.toMatch(
      /#region src\/(?:server\.ts|providers\/chatgpt|http\/routes\/chatgpt-auth)/
    );
    const syntax = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS
    );
    const dependencies: string[] = [];
    function scan(node: ts.Node): void {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        dependencies.push(node.moduleSpecifier.text);
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteral(argument))
          dependencies.push(argument.text);
      }
      ts.forEachChild(node, scan);
    }
    scan(syntax);
    for (const dependency of dependencies) {
      expect(dependency).not.toMatch(
        /^(?:node:sqlite|sqlite|drizzle-orm|@agentclientprotocol\/sdk)(?:\/|$)/
      );
      if (dependency.startsWith(".")) {
        const resolved = path.resolve(path.dirname(filename), dependency);
        expect(resolved.startsWith(path.join(stage, "dist") + path.sep)).toBe(
          true
        );
        await visit(resolved);
      }
    }
  }
  await visit(entry);
  expect(visited.size).toBeGreaterThan(1);
}

describe("built media-only entry", () => {
  for (const format of ["esm", "cjs"] as const) {
    it(`starts and generates through public ${format} exports with agent authority unavailable`, async () => {
      await assertMediaClosure(
        path.join(
          stage,
          "dist",
          `media-server.${format === "esm" ? "mjs" : "cjs"}`
        )
      );
      const { stdout, stderr } = await execute(
        process.execPath,
        [
          "--disable-warning=ExperimentalWarning",
          path.join(stage, "probe.mjs"),
          format,
        ],
        {
          cwd: stage,
          timeout: 20_000,
          maxBuffer: 256 * 1024,
          env: {
            PATH: process.env.PATH,
            HOME: path.join(stage, "home"),
            TMPDIR: stage,
            NODE_ENV: "production",
          },
        }
      );
      expect(stderr).toBe("");
      expect(JSON.parse(stdout)).toEqual({
        format,
        byok: 1,
        gg: 1,
        guarded: true,
        lightweight: true,
      });
    }, 30_000);
  }
});

// A real child runs outside Vitest's source aliases. Every provider response is
// synthetic. Positive controls establish that unavailable authority really fails.
const probe = String.raw`
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire, registerHooks, syncBuiltinESMExports } from "node:module";
import child from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import dns from "node:dns";
const format = process.argv[2];
const require = createRequire(import.meta.url);
const sqlite = require("node:sqlite");
const NativeDatabase = sqlite.DatabaseSync;
const executeFile = child.execFile;
let custodyEnabled = false;
const base = path.join(process.cwd(), "run-" + format);
await fsp.mkdir(base, { recursive: true });
const forbidden = { module: 0, process: 0, network: 0, state: 0 };
function deny(kind) { forbidden[kind]++; throw new Error("Forbidden " + kind + " authority"); }
sqlite.DatabaseSync = class extends NativeDatabase {
  constructor(filename, options) {
    const state = fs.realpathSync(path.join(base, "state"));
    if (!custodyEnabled || ![
      path.join(state, ".auth-lock", "profile.lock.sqlite"),
      path.join(state, "providers", "profile.lock.sqlite"),
    ].includes(filename)) deny("module");
    super(filename, options);
  }
  exec(sql) {
    if (!["PRAGMA busy_timeout = 0", "BEGIN IMMEDIATE", "ROLLBACK"].includes(sql)) deny("module");
    return super.exec(sql);
  }
};
registerHooks({ resolve(specifier, context, next) {
  if (/^(?:drizzle-orm|@agentclientprotocol\/sdk)(?:\/|$)/.test(specifier) ||
    (/^(?:node:)?sqlite$/.test(specifier) && !custodyEnabled)) deny("module");
  return next(specifier, context);
} });
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"])
  child[name] = () => deny("process");
child.execFile = (file, args, options, callback) => {
  const root = fs.realpathSync(base), target = args?.[1];
  const owned = typeof target === "string" && (target === root || target.startsWith(root + path.sep) || root.startsWith(target.endsWith(path.sep) ? target : target + path.sep));
  if (!custodyEnabled || file !== "/bin/ls" || args?.length !== 2 || args[0] !== "-lde" || !owned ||
    options?.env?.LC_ALL !== "C" || options?.env?.LANG !== "C" || Object.keys(options.env).length !== 2) deny("process");
  return executeFile(file, args, options, callback);
};
globalThis.fetch = async () => deny("network");
for (const module of [http, https]) for (const name of ["request", "get"]) module[name] = () => deny("network");
net.Socket.prototype.connect = () => deny("network");
net.Server.prototype.listen = () => deny("network");
dns.lookup = () => deny("network");
function guardedFile(original) {
  return function (filename, ...args) {
    const value = filename instanceof URL ? filename.pathname : String(filename);
    if (/(?:^|\/)(?:sessions\.db(?:-.*)?|scratch|skills|\.agents|\.claude)(?:\/|$)/.test(value)) deny("state");
    return original.call(this, filename, ...args);
  };
}
for (const name of ["mkdir", "readdir", "readFile", "writeFile", "open", "stat", "lstat", "access", "rm", "unlink"])
  fsp[name] = guardedFile(fsp[name]);
for (const name of ["mkdirSync", "readdirSync", "readFileSync", "writeFileSync", "openSync", "statSync", "lstatSync", "accessSync", "rmSync", "unlinkSync"])
  fs[name] = guardedFile(fs[name]);
syncBuiltinESMExports();
await assert.rejects(import("node:sqlite"), /Forbidden module/);
assert.throws(() => child.spawn("unused"), /Forbidden process/);
await assert.rejects(fetch("https://unreachable.invalid"), /Forbidden network/);
assert.throws(() => fs.openSync(path.join(base, "sessions.db"), "r"), /Forbidden state/);
for (const key of Object.keys(forbidden)) forbidden[key] = 0;
for (const name of ["log", "info", "warn", "error"]) console[name] = () => {};

const load = (specifier) => format === "esm" ? import(specifier) : Promise.resolve(require(specifier));
const { createMediaDaemon, createMediaTenant } = await load("@grida/agent/media-server");
assert.equal(typeof createMediaTenant, "function");
const password = "synthetic-entry-password";
const origin = "https://desktop.invalid";
const key = "synthetic-entry-provider-key";
const token = "synthetic-entry-scoped-token";
const gateway = "https://grida.invalid";
let byok = 0, gg = 0;
const options = {
  password, user_data_path: path.join(base, "state"), media_root: path.join(base, "media"),
  http_access: { allowed_origins: [origin], allowed_referer_paths: ["/desktop"] },
  gg_base_url: gateway,
  provider_http: {
    request: async (input, init) => {
      const url = String(input), headers = new Headers(init?.headers);
      if (url === gateway + "/api/v1/models/catalog") return new Response(null, { status: 404 });
      if (url === gateway + "/api/v1/ai/music/generations") {
        assert.equal(headers.get("authorization"), "Bearer " + token);
        assert.equal(headers.has("xi-api-key"), false);
        gg++;
        return Response.json({ model_id: "google/lyria-3", provider_id: "gg", audio: { base64: "SUQz", media_type: "audio/mpeg", file_name: "lyria-3.mp3" } });
      }
      assert.equal(url, "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128");
      assert.equal(headers.get("xi-api-key"), key);
      assert.equal(headers.has("authorization"), false);
      byok++;
      return new Response(new Uint8Array([73, 68, 51]), { headers: { "content-type": "audio/mpeg" } });
    },
    download: async () => deny("network"),
  },
};
function call(daemon, pathname, value = {}) {
  return daemon.fetch(new Request("http://127.0.0.1" + pathname, {
    method: "POST", body: JSON.stringify(value),
    headers: { authorization: "Basic " + Buffer.from("agent:" + password).toString("base64"), origin, referer: origin + "/desktop/media", "content-type": "application/json" },
  }));
}
const daemon = createMediaDaemon(options);
await daemon.start({ listen: false });
try {
  const handshake = await (await call(daemon, "/handshake")).json();
  assert.equal(handshake.capabilities.agent, false);
  assert.equal(handshake.capabilities.sessions, false);
  assert.equal(handshake.capabilities.sound_effects, true);
  assert.equal(handshake.capabilities.music, true);
  assert.equal((await call(daemon, "/agent/run")).status, 404);
  custodyEnabled = true;
  assert.equal((await call(daemon, "/secrets/set", { provider_id: "elevenlabs", key })).status, 200);
  const sound = await call(daemon, "/audio/sound-effects/generate", { model_id: "eleven_text_to_sound_v2", prompt: "clock ticking" });
  assert.equal(sound.status, 200);
  const generated = await sound.json();
  assert.equal(generated.audio.base64, "SUQz");
  assert.equal(generated.stored_media.byte_size, 3);
  assert.equal(JSON.stringify(generated).includes(key), false);
  assert.equal((await call(daemon, "/auth/gg/set", { access_token: token, expires_at: Date.now() + 900000, organization: { id: 1, name: "synthetic-org" } })).status, 200);
  assert.equal((await call(daemon, "/audio/music/generate", { model_id: "google/lyria-3", prompt: "drums" })).status, 200);
} finally { await daemon.stop(); }
const restart = createMediaDaemon(options);
await restart.start({ listen: false });
try {
  assert.deepEqual(await (await call(restart, "/auth/gg/status")).json(), { active: false });
} finally { await restart.stop(); }

// Desktop imports these helpers without using the heavyweight /server barrel.
// Merely importing scratch preparation must not prepare any scratch directory.
const sandbox = await load("@grida/agent/sandbox");
assert.equal(typeof sandbox.defaultScratchBase, "function");
assert.equal(typeof sandbox.prepareScratchAuthority, "function");
const protocol = await load("@grida/agent");
assert.equal(protocol.CHATGPT_AUTH_ROUTE_PATHS.status, "/auth/chatgpt/status");
assert.equal(Object.isFrozen(protocol.CHATGPT_AUTH_ROUTE_PATHS), true);
assert.deepEqual(forbidden, { module: 0, process: 0, network: 0, state: 0 });
assert.equal(byok, 1);
assert.equal(gg, 1);
process.stdout.write(JSON.stringify({ format, byok, gg, guarded: true, lightweight: true }));
`;
