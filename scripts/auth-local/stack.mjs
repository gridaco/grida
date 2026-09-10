#!/usr/bin/env node
// GRIDA-SEC-011 — owned local provisioning; no ambient project or credentials.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fixture, guards } from "./guards.mjs";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(sourceDir, "../..");
const lockPath = path.join(os.tmpdir(), "grida-auth-test.lock");
const excludedServices =
  "realtime,imgproxy,edge-runtime,logflare,vector,supavisor";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function privateJson(filename, value) {
  await fs.writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await fs.chmod(filename, 0o600);
}

async function regularFile(filename) {
  assert(
    (await fs.lstat(filename)).isFile(),
    "Expected a regular file, not a symlink"
  );
}

async function absent(filename) {
  try {
    await fs.lstat(filename);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(
    `Forbidden fixture metadata exists: ${path.basename(filename)}`
  );
}

async function assertUnlinked(state) {
  for (const name of ["project-ref", "pooler-url"]) {
    await absent(path.join(state.workdir, "supabase/.temp", name));
  }
  await absent(path.join(state.workdir, ".supabase"));
  await absent(path.join(state.home, ".supabase/access-token"));
  // The CLI walks ancestors for dotenv files. Do not accidentally pick one up
  // outside this fresh workdir, either.
  for (
    let directory = path.join(state.workdir, "supabase");
    ;
    directory = path.dirname(directory)
  ) {
    await absent(path.join(directory, ".env"));
    await absent(path.join(directory, ".env.local"));
    if (directory === path.dirname(directory)) break;
  }
  for (const [name, expected] of [
    ["gotrue-version", /^v?2\.196\.0$/],
    ["postgres-version", /^15\./],
  ]) {
    try {
      const version = await fs.readFile(
        path.join(state.workdir, "supabase/.temp", name),
        "utf8"
      );
      assert.match(
        version.trim(),
        expected,
        "Unexpected cached fixture image override"
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export async function readState(filename) {
  assert(path.isAbsolute(filename), "--state must be an absolute path");
  await regularFile(filename);
  const state = guards.state(
    JSON.parse(await fs.readFile(filename, "utf8")),
    filename,
    repoRoot
  );
  assert.equal(
    await fs.realpath(state.root),
    state.root,
    "Fixture root must be canonical"
  );
  for (const directory of [
    state.root,
    state.home,
    state.workdir,
    path.join(state.workdir, "supabase"),
  ]) {
    assert(
      (await fs.lstat(directory)).isDirectory(),
      "Fixture directories cannot be symlinks"
    );
  }
  for (const [key, name] of [
    ["setupPath", "setup.json"],
    ["editorEnvPath", "editor.env"],
    ["publicClientPath", "public-client.json"],
  ]) {
    assert.equal(
      state[key],
      path.join(state.root, name),
      "Fixture output path escaped its directory"
    );
  }
  const configPath = path.join(state.workdir, "supabase/config.toml");
  await regularFile(configPath);
  const config = await fs.readFile(configPath);
  assert.equal(
    sha256(config),
    sha256(await fs.readFile(path.join(sourceDir, "config.toml"))),
    "Fixture config differs from the reviewed local config"
  );
  await assertUnlinked(state);
  return state;
}

async function run(state, binary, args, timeout = 30_000) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: state.workdir,
      env: guards.childEnv(state),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let overflow = false;
    const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
    const hardTimer = setTimeout(() => child.kill("SIGKILL"), timeout + 5_000);
    const collect = (stream, text) => {
      if (stdout.length + stderr.length > 16 * 1024 * 1024) {
        overflow = true;
        child.kill("SIGTERM");
      } else if (stream === "stdout") stdout += text;
      else stderr += text;
    };
    child.stdout.on("data", (text) => collect("stdout", text));
    child.stderr.on("data", (text) => collect("stderr", text));
    child.on("error", (error) => {
      clearTimeout(timer);
      clearTimeout(hardTimer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      clearTimeout(hardTimer);
      resolve({ code, signal, stdout, stderr, overflow });
    });
  });
  const safeOutput = guards.redact(`${result.stdout}\n${result.stderr}`);
  await fs.appendFile(
    path.join(state.root, "commands.log"),
    `\n${path.basename(binary)} ${args.join(" ")} [exit ${result.code}, signal ${result.signal}]\n${safeOutput}\n`,
    { mode: 0o600 }
  );
  if (result.code !== 0 || result.overflow) {
    throw new Error(
      `${path.basename(binary)} ${args[0]} failed. Redacted details: ${path.join(state.root, "commands.log")}`
    );
  }
  return result.stdout;
}

async function checkVersions(state) {
  for (const binary of [state.supabaseBin, state.supabaseGoBin]) {
    await regularFile(binary);
    const output = await run(state, binary, ["--version"]);
    assert.equal(
      output.trim(),
      fixture.cliVersion,
      "The Supabase bundle must match the pinned release"
    );
  }
}

async function cli(state, args, timeout) {
  await assertUnlinked(state);
  return run(
    state,
    state.supabaseBin,
    [...args, "--workdir", state.workdir],
    timeout
  );
}

async function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        text += chunk;
        if (text.length > 4 * 1024 * 1024)
          req.destroy(new Error("Local response exceeded fixture limit"));
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(
            new Error(
              `Local ${options.method ?? "GET"} ${options.path.split("?")[0]} returned HTTP ${res.statusCode}`
            )
          );
          return;
        }
        try {
          resolve(text ? JSON.parse(text) : null);
        } catch {
          reject(new Error("Local endpoint returned invalid JSON"));
        }
      });
    });
    req.on("error", () =>
      reject(
        new Error(
          `Cannot reach local ${options.socketPath ? "Docker socket" : "fixture API"}`
        )
      )
    );
    req.setTimeout(10_000, () =>
      req.destroy(new Error("Local request timed out"))
    );
    req.end(body);
  });
}

async function docker(state, route) {
  assert(
    (await fs.stat(state.dockerSocket)).isSocket(),
    "Docker path is not a Unix socket"
  );
  return request({ socketPath: state.dockerSocket, path: route });
}

async function api(state, route, { method = "GET", token, apiKey, body } = {}) {
  const url = guards.localUrl(new URL(route, fixture.apiUrl).href);
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers.apikey = apiKey;
  return request(
    {
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      headers,
    },
    body === undefined ? undefined : JSON.stringify(body)
  );
}

async function availablePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(`Fixture port ${port} is in use; no services were stopped`)
      )
    );
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () =>
      server.close(resolve)
    );
  });
}

async function claim(state) {
  try {
    await fs.mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        `Another fixture owns ${fixture.projectId}. Stop that fixture before starting a new one.`
      );
    throw error;
  }
  await privateJson(path.join(lockPath, "owner.json"), {
    id: state.id,
    root: state.root,
  });
}

async function assertOwner(state) {
  const owner = JSON.parse(
    await fs.readFile(path.join(lockPath, "owner.json"), "utf8")
  );
  assert.equal(owner.id, state.id, "Another fixture owns this project");
  assert.equal(owner.root, state.root, "Another fixture owns this project");
}

async function inspect(state) {
  await assertOwner(state);
  const auth = await docker(
    state,
    `/containers/supabase_auth_${fixture.projectId}/json`
  );
  const db = await docker(
    state,
    `/containers/supabase_db_${fixture.projectId}/json`
  );
  assert.equal(auth.Name, `/supabase_auth_${fixture.projectId}`);
  assert.equal(db.Name, `/supabase_db_${fixture.projectId}`);
  guards.images({ auth: auth.Config.Image, postgres: db.Config.Image });
  const env = Object.fromEntries(
    auth.Config.Env.map((item) => {
      const i = item.indexOf("=");
      return [item.slice(0, i), item.slice(i + 1)];
    })
  );
  assert.equal(env.GOTRUE_SITE_URL, fixture.editorOrigin);
  assert.equal(env.GOTRUE_OAUTH_SERVER_ENABLED, "true");
  assert.equal(env.GOTRUE_OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION, "false");
  assert.equal(env.GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH, "/oauth/consent");
  const health = await api(state, "/auth/v1/health");
  assert.equal(health.version.replace(/^v/, ""), fixture.authVersion);
  const discovery = await api(
    state,
    "/auth/v1/.well-known/openid-configuration"
  );
  assert.equal(discovery.issuer, fixture.issuer);
  assert.equal(
    discovery.authorization_endpoint,
    `${fixture.issuer}/oauth/authorize`
  );
  assert.equal(discovery.token_endpoint, `${fixture.issuer}/oauth/token`);
  return {
    projectId: fixture.projectId,
    authImage: auth.Config.Image,
    postgresImage: db.Config.Image,
    issuer: discovery.issuer,
  };
}

async function prepare(options) {
  assert(
    path.isAbsolute(options["supabase-bin"] ?? ""),
    "--supabase-bin must be an absolute path"
  );
  const dockerSocket = guards.socketPath(options["docker-socket"]);
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-auth-test-"))
  );
  await fs.chmod(root, 0o700);
  const state = {
    version: fixture.version,
    id: randomUUID(),
    projectId: fixture.projectId,
    cliVersion: fixture.cliVersion,
    authVersion: fixture.authVersion,
    repoRoot,
    root,
    workdir: path.join(root, "workdir"),
    home: path.join(root, "home"),
    supabaseBin: await fs.realpath(options["supabase-bin"]),
    supabaseGoBin: await fs.realpath(
      path.join(path.dirname(options["supabase-bin"]), "supabase-go")
    ),
    dockerSocket,
    phase: "prepared",
    setupPath: path.join(root, "setup.json"),
    editorEnvPath: path.join(root, "editor.env"),
    publicClientPath: path.join(root, "public-client.json"),
  };
  for (const directory of [
    state.workdir,
    state.home,
    path.join(state.home, ".docker"),
    path.join(root, "tmp"),
    path.join(state.workdir, "supabase/migrations"),
  ])
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await checkVersions(state);
  const paths = (
    await run(state, "/usr/bin/git", [
      "-C",
      repoRoot,
      "ls-files",
      "-z",
      "--",
      "supabase/migrations",
      "supabase/seed.sql",
    ])
  )
    .split("\0")
    .filter(Boolean);
  assert(
    paths.includes("supabase/seed.sql") && paths.length > 1,
    "Repository migrations and seed are required"
  );
  state.sources = [];
  for (const relative of paths) {
    guards.sourcePath(relative);
    const source = path.join(repoRoot, relative);
    await regularFile(source);
    const content = await fs.readFile(source);
    await fs.writeFile(path.join(state.workdir, relative), content, {
      mode: 0o600,
    });
    state.sources.push({ path: relative, sha256: sha256(content) });
  }
  await fs.copyFile(
    path.join(sourceDir, "config.toml"),
    path.join(state.workdir, "supabase/config.toml")
  );
  const statePath = path.join(root, "fixture.json");
  await privateJson(statePath, state);
  await readState(statePath);
  return {
    statePath,
    workdir: state.workdir,
    setupPath: state.setupPath,
    editorEnvPath: state.editorEnvPath,
    publicClientPath: state.publicClientPath,
  };
}

async function start(state) {
  await checkVersions(state);
  if (state.phase === "started" || state.phase === "bootstrapped")
    return inspect(state);
  assert.equal(
    state.phase,
    "prepared",
    "Use stop after a failed start, then prepare a fresh fixture"
  );
  await claim(state);
  try {
    const containers = await docker(state, "/containers/json?all=1");
    assert(
      !containers.some((container) =>
        container.Names.some((name) => name.endsWith(`_${fixture.projectId}`))
      ),
      "Fixture containers already exist; nothing was changed"
    );
    const volumes = await docker(state, "/volumes");
    assert(
      !(volumes.Volumes ?? []).some((volume) =>
        volume.Name.endsWith(`_${fixture.projectId}`)
      ),
      "Fixture volumes already exist; nothing was changed"
    );
    for (const port of fixture.ports) await availablePort(port);
  } catch (error) {
    await fs.rm(lockPath, { recursive: true });
    throw error;
  }
  state.phase = "starting";
  await privateJson(path.join(state.root, "fixture.json"), state);
  console.error(
    "Starting isolated grida_auth_test stack; CLI output goes to the redacted fixture log."
  );
  await cli(state, ["start", "--exclude", excludedServices], 20 * 60_000);
  const observed = await inspect(state);
  state.phase = "started";
  state.observed = observed;
  await privateJson(path.join(state.root, "fixture.json"), state);
  return observed;
}

async function bootstrap(state) {
  await inspect(state);
  const status = JSON.parse(await cli(state, ["status", "--output", "json"]));
  assert.equal(
    status.API_URL,
    fixture.apiUrl,
    "CLI status points outside the fixture"
  );
  const dbUrl = new URL(status.DB_URL);
  assert.equal(dbUrl.hostname, "127.0.0.1");
  assert.equal(dbUrl.port, "55432");
  assert.equal(typeof status.ANON_KEY, "string");
  assert.equal(typeof status.SERVICE_ROLE_KEY, "string");
  const credentials = {
    token: status.SERVICE_ROLE_KEY,
    apiKey: status.SERVICE_ROLE_KEY,
  };
  const name = `Grida CLI auth fixture ${state.id}`;
  const listed = await api(state, "/auth/v1/admin/oauth/clients", credentials);
  let client = guards
    .oauthClients(listed)
    .find((item) => item.client_name === name);
  if (!client)
    client = await api(state, "/auth/v1/admin/oauth/clients", {
      ...credentials,
      method: "POST",
      body: {
        client_name: name,
        client_type: "public",
        token_endpoint_auth_method: "none",
        redirect_uris: fixture.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
    });
  assert.equal(client.client_type, "public");
  assert.equal(client.token_endpoint_auth_method, "none");
  assert.deepEqual(client.redirect_uris, fixture.redirectUris);
  assert.match(client.client_id, /^[0-9a-f-]{36}$/);
  const publicClient = {
    clientId: client.client_id,
    issuer: fixture.issuer,
    apiOrigin: fixture.editorOrigin,
    redirectUris: fixture.redirectUris,
  };
  const editorEnv = {
    NEXT_PUBLIC_SUPABASE_URL: fixture.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH: "1",
    GRIDA_OAUTH_ISSUER: fixture.issuer,
    GRIDA_OAUTH_ORIGIN: fixture.editorOrigin,
    GRIDA_API_ORIGIN: fixture.editorOrigin,
    GRIDA_OAUTH_CLIENT_IDS: client.client_id,
    GRIDA_OAUTH_REDIRECT_URIS: fixture.redirectUris.join(","),
    GRIDA_OAUTH_CONSENT_SECRET: randomBytes(32).toString("base64url"),
    // GRIDA-SEC-006 / GRIDA-SEC-011: fresh fixture-only GG authority, never inherited.
    // GRIDA-GG: token — independent disposable signing key.
    GG_TOKEN_SECRET: randomBytes(32).toString("base64url"),
  };
  await privateJson(state.publicClientPath, publicClient);
  await privateJson(state.setupPath, {
    apiUrl: fixture.apiUrl,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
    editorOrigin: fixture.editorOrigin,
    editorEnv,
    publicClientPath: state.publicClientPath,
    editorEnvPath: state.editorEnvPath,
    users: [
      { email: "insider@grida.co", password: "password" },
      { email: "alice@acme.com", password: "password" },
      { email: "random@example.com", password: "password" },
    ],
  });
  await fs.writeFile(
    state.editorEnvPath,
    Object.entries(editorEnv)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { mode: 0o600 }
  );
  await fs.chmod(state.editorEnvPath, 0o600);
  state.phase = "bootstrapped";
  await privateJson(path.join(state.root, "fixture.json"), state);
  return {
    projectId: fixture.projectId,
    publicClientPath: state.publicClientPath,
    setupPath: state.setupPath,
    editorEnvPath: state.editorEnvPath,
  };
}

async function stop(state) {
  await assertOwner(state);
  assert(["starting", "started", "bootstrapped"].includes(state.phase));
  await cli(
    state,
    ["stop", "--project-id", fixture.projectId, "--no-backup"],
    120_000
  );
  state.phase = "stopped";
  await privateJson(path.join(state.root, "fixture.json"), state);
  await fs.rm(lockPath, { recursive: true });
  return {
    projectId: fixture.projectId,
    stopped: true,
    statePath: path.join(state.root, "fixture.json"),
  };
}

async function main(args) {
  const [command, ...rest] = args;
  assert(
    ["prepare", "start", "bootstrap", "inspect", "stop"].includes(command),
    "Usage: stack.mjs prepare --supabase-bin ABS --docker-socket ABS | start|bootstrap|inspect|stop --state ABS"
  );
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    assert(
      rest[index].startsWith("--") && rest[index + 1],
      "Options require a value"
    );
    const key = rest[index].slice(2);
    assert(!Object.hasOwn(options, key), "Duplicate option");
    options[key] = rest[index + 1];
  }
  const allowed =
    command === "prepare" ? ["supabase-bin", "docker-socket"] : ["state"];
  assert(
    Object.keys(options).every((key) => allowed.includes(key)),
    "Unknown option"
  );
  const result =
    command === "prepare"
      ? await prepare(options)
      : await { start, bootstrap, inspect, stop }[command](
          await readState(options.state)
        );
  console.log(JSON.stringify(result));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(guards.redact(error.message));
    process.exitCode = 1;
  });
}
