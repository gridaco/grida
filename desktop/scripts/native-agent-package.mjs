// GRIDA-SEC-004 — package the fixed native executables outside app.asar.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The shared binary-format check runs in Node's packaging program.
const { binaryHeader } = await import(
  new URL("../../scripts/cli-release/native.mjs", import.meta.url).href
);

const DIRECTORY = "native-agent";
const MAX_BINARY_BYTES = 128 * 1024 * 1024;
const MAX_SMOKE_OUTPUT_BYTES = 64 * 1024;
const SMOKE_TIMEOUT_MS = 5000;
const workspace = fileURLToPath(new URL("../../", import.meta.url));
const rustTargets = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "win32-x64": "x86_64-pc-windows-msvc",
};

function executables(os, cpu) {
  assert(["darwin", "linux", "win32"].includes(os), "Unsupported agent OS");
  assert(
    cpu === "x64" || (cpu === "arm64" && os !== "win32"),
    "Unsupported native agent package architecture"
  );
  return os === "win32"
    ? ["grida-agent.exe"]
    : ["grida-agent", "agent-kit-sandbox-helper"];
}

function readExecutable(file, os, cpu, packaged = false) {
  const before = fs.lstatSync(file);
  assert(before.isFile(), "Native agent artifact must be a regular file");
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY |
      (fs.constants.O_NOFOLLOW ?? 0) |
      (fs.constants.O_NONBLOCK ?? 0)
  );
  try {
    const stat = fs.fstatSync(descriptor);
    assert(
      stat.isFile() && stat.dev === before.dev && stat.ino === before.ino,
      "Native agent artifact changed while opening"
    );
    assert(
      stat.size >= 64 && stat.size <= MAX_BINARY_BYTES,
      "Native agent artifact size is outside the package limit"
    );
    if (packaged && os !== "win32") {
      assert(
        (stat.mode & 0o111) !== 0 && (stat.mode & 0o022) === 0,
        "Packaged native agent executable permissions are unsafe"
      );
    }
    const bytes = Buffer.alloc(stat.size);
    for (let offset = 0; offset < bytes.length; ) {
      const read = fs.readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset
      );
      assert(read > 0, "Native agent artifact changed while reading");
      offset += read;
    }
    const after = fs.fstatSync(descriptor);
    assert(
      after.size === stat.size && after.mtimeMs === stat.mtimeMs,
      "Native agent artifact changed while reading"
    );
    binaryHeader(bytes, { os, cpu });
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

export function stageNativeAgent(resources, artifacts, os, cpu) {
  assert(
    path.isAbsolute(artifacts),
    "Native agent artifact root must be absolute"
  );
  const names = executables(os, cpu);
  const target = path.join(artifacts, `${os}-${cpu}`);
  assert(
    fs.lstatSync(target).isDirectory(),
    "Native agent target must be a directory"
  );
  const destination = path.join(resources, DIRECTORY);
  assert(
    !fs.existsSync(destination),
    "Native agent destination already exists"
  );
  const staging = fs.mkdtempSync(path.join(resources, ".native-agent-"));
  try {
    for (const name of names) {
      const bytes = readExecutable(path.join(target, name), os, cpu);
      const file = path.join(staging, name);
      fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o755 });
      fs.chmodSync(file, 0o755);
    }
    // Packaged resources are consumed by the application's user after install.
    fs.chmodSync(staging, 0o755);
    fs.renameSync(staging, destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/** Build the fixed native resources for the current packaging machine. */
export function buildNativeAgentArtifacts(artifacts, os, cpu) {
  const names = executables(os, cpu);
  assert(
    os === process.platform && cpu === process.arch,
    "Cross-target packages require GRIDA_DESKTOP_NATIVE_ARTIFACTS"
  );
  assert(
    path.isAbsolute(artifacts),
    "Native agent artifact root must be absolute"
  );
  const tag = `${os}-${cpu}`;
  const target = rustTargets[tag];
  const targetDir = path.join(workspace, "target", "desktop-agent");
  const selection = ["-p", "grida-agent", "--bin", "grida-agent"];
  if (os !== "win32") {
    selection.push(
      "-p",
      "agent-kit-sandbox",
      "--bin",
      "agent-kit-sandbox-helper"
    );
  }
  execFileSync(
    "cargo",
    [
      "build",
      "--locked",
      "--release",
      "--target",
      target,
      "--target-dir",
      targetDir,
      ...selection,
    ],
    {
      cwd: workspace,
      stdio: "inherit",
      env: {
        ...process.env,
        CARGO_PROFILE_RELEASE_STRIP: "symbols",
        ...(os === "darwin" ? { MACOSX_DEPLOYMENT_TARGET: "11.0" } : {}),
      },
    }
  );
  const built = path.join(targetDir, target, "release");
  const output = path.join(artifacts, tag);
  fs.mkdirSync(output, { mode: 0o700 });
  for (const name of names) {
    fs.writeFileSync(
      path.join(output, name),
      readExecutable(path.join(built, name), os, cpu),
      { flag: "wx", mode: 0o755 }
    );
  }
}

export function verifyNativeAgent(resources, os, cpu) {
  const names = executables(os, cpu);
  const directory = path.join(resources, DIRECTORY);
  assert(
    fs.lstatSync(directory).isDirectory(),
    "Native agent resources must be a directory"
  );
  assert.deepEqual(
    fs.readdirSync(directory).sort(),
    [...names].sort(),
    "Native agent resource contents do not match the target"
  );
  for (const name of names) {
    readExecutable(path.join(directory, name), os, cpu, true);
  }
  return path.resolve(directory, names[0]);
}

/** Verify the installed entrypoint and observational reopen on its native target. */
export async function verifyNativeAgentRuntime(resources, platform, arch) {
  const executable = verifyNativeAgent(resources, platform, arch);
  if (platform !== process.platform || arch !== process.arch) return false;

  const root = fs.mkdtempSync(
    path.join(fs.realpathSync.native(os.tmpdir()), "grida-native-smoke-")
  );
  try {
    if (process.platform !== "win32") {
      const directory = fs.lstatSync(root);
      assert(
        directory.isDirectory() &&
          directory.uid === process.getuid() &&
          (directory.mode & 0o777) === 0o700,
        "Native agent smoke directory must be private"
      );
    }
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const state = path.join(root, "state");
    const initialize = {
      method: "initialize",
      params: { protocolVersion: 1 },
      check: (result) =>
        result?.protocolVersion === 1 &&
        result.agentCapabilities?.loadSession === true,
    };
    const [, session] = await smokeProcess(executable, root, cwd, state, [
      initialize,
      {
        method: "session/new",
        params: { cwd, mcpServers: [] },
        check: (result) =>
          typeof result?.sessionId === "string" &&
          /^[a-zA-Z0-9_-]{1,128}$/.test(result.sessionId),
      },
    ]);
    await smokeProcess(executable, root, cwd, state, [
      initialize,
      {
        method: "session/list",
        params: { cwd },
        check: (result) =>
          result?.sessions?.length === 1 &&
          result.sessions[0]?.sessionId === session.sessionId,
      },
      {
        method: "session/load",
        params: { cwd, mcpServers: [], sessionId: session.sessionId },
        check: (result) => result !== null && typeof result === "object",
      },
    ]);
    return true;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function smokeProcess(executable, root, cwd, state, requests) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [
        "serve",
        "--stdio",
        "--state-dir",
        state,
        "--endpoint",
        "http://127.0.0.1:1/v1",
        "--model",
        "packaged-smoke",
      ],
      {
        cwd,
        env: {
          HOME: root,
          TMPDIR: root,
          ...(process.platform === "win32" && {
            SystemRoot: process.env.SystemRoot,
            USERPROFILE: root,
            APPDATA: root,
            LOCALAPPDATA: root,
            TEMP: root,
            TMP: root,
          }),
        },
        shell: false,
        stdio: "pipe",
        windowsHide: true,
      }
    );
    const results = [];
    let pending = Buffer.alloc(0);
    let outputBytes = 0;
    let failure;
    const deadline = setTimeout(
      () => stop("Packaged native agent did not finish before its deadline"),
      SMOKE_TIMEOUT_MS
    );
    function stop(message) {
      if (failure) return;
      failure = new Error(message);
      child.kill("SIGKILL");
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
    }
    function withinOutputLimit(chunk) {
      outputBytes += chunk.length;
      if (outputBytes > MAX_SMOKE_OUTPUT_BYTES)
        stop("Packaged native agent exceeded its output limit");
      return !failure;
    }
    function send() {
      const request = requests[results.length];
      if (!request) return child.stdin.end();
      const { method, params } = request;
      const frame = { jsonrpc: "2.0", id: results.length + 1, method, params };
      child.stdin.write(`${JSON.stringify(frame)}\n`);
    }

    child.once("spawn", send);
    child.on("error", () => stop("Could not launch the packaged native agent"));
    child.stdin.on("error", () =>
      stop("Packaged native agent closed its input")
    );
    child.stdout.on("data", (chunk) => {
      if (!withinOutputLimit(chunk)) return;
      pending = Buffer.concat([pending, chunk]);
      const newline = pending.indexOf(10);
      if (newline === -1) return;
      const request = requests[results.length];
      try {
        const frame = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            pending.subarray(0, newline)
          )
        );
        assert.equal(newline + 1, pending.length);
        assert.equal(frame.jsonrpc, "2.0");
        assert.equal(frame.id, results.length + 1);
        assert.ok(
          request &&
            !Object.hasOwn(frame, "error") &&
            request.check(frame.result)
        );
        pending = Buffer.alloc(0);
        results.push(frame.result);
        send();
      } catch {
        stop(
          `Packaged native agent returned an invalid ${request?.method ?? "extra"} reply`
        );
      }
    });
    child.stderr.on("data", withinOutputLimit);
    child.once("close", (code, signal) => {
      clearTimeout(deadline);
      if (failure) return reject(failure);
      if (
        code !== 0 ||
        signal ||
        results.length !== requests.length ||
        pending.length
      )
        return reject(
          new Error("Packaged native agent did not exit cleanly after ACP EOF")
        );
      resolve(results);
    });
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [resources, artifacts, os, cpu] = process.argv.slice(2);
  stageNativeAgent(resources, artifacts, os, cpu);
}
