// GRIDA-SEC-010 / GRIDA-SEC-013 — native syntax/output checks use no live authority.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repository = fileURLToPath(new URL("../../", import.meta.url));

export function validateCases(cases) {
  assert(Array.isArray(cases) && cases.length > 0, "No CLI contract cases");
  const ids = new Set();
  for (const value of cases) {
    assert.match(value.id, /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/);
    assert(!ids.has(value.id), `Duplicate case: ${value.id}`);
    ids.add(value.id);
    assert(
      value.mode === undefined || value.mode === "parse",
      `Unknown driver: ${value.id}`
    );
    assert(
      Array.isArray(value.argv) &&
        value.argv.every((arg) => typeof arg === "string")
    );
    assert(value.stdin === undefined || typeof value.stdin === "string");
    assert([0, 1, 2].includes(value.expected.exit));
    assert.equal(typeof value.expected.stderr, "string");
    const stdout = value.expected.stdout;
    assert.equal(
      Object.keys(stdout).length,
      1,
      `Choose one stdout assertion: ${value.id}`
    );
    if (Object.hasOwn(stdout, "text"))
      assert.equal(typeof stdout.text, "string");
    else if (Object.hasOwn(stdout, "version"))
      assert.equal(stdout.version, true);
    else if (Object.hasOwn(stdout, "json"))
      assert(stdout.json && typeof stdout.json === "object");
    else {
      assert(Array.isArray(stdout.includes) && stdout.includes.length > 0);
      assert(
        stdout.includes.every(
          (text) => typeof text === "string" && text.length > 0
        )
      );
    }
  }
  return cases;
}

export function assertResult(test, result, version) {
  if (result.error) throw result.error;
  assert.equal(result.signal, null, `${test.id}: process terminated by signal`);
  assert.equal(result.status, test.expected.exit, `${test.id}: exit code`);
  assert.equal(result.stderr, test.expected.stderr, `${test.id}: stderr`);
  const expected = test.expected.stdout;
  if (Object.hasOwn(expected, "text"))
    assert.equal(result.stdout, expected.text, `${test.id}: stdout`);
  else if (Object.hasOwn(expected, "version")) {
    assert.equal(
      typeof version,
      "string",
      `${test.id}: missing package version`
    );
    assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    assert.equal(
      result.stdout,
      `grida ${version}\n`,
      `${test.id}: package version`
    );
  } else if (Object.hasOwn(expected, "json")) {
    assert(result.stdout.endsWith("\n"), `${test.id}: JSON newline`);
    assert.deepEqual(
      JSON.parse(result.stdout),
      expected.json,
      `${test.id}: JSON envelope`
    );
  } else {
    for (const text of expected.includes)
      assert(
        result.stdout.includes(text),
        `${test.id}: missing help text ${JSON.stringify(text)}`
      );
    assert(result.stdout.endsWith("\n"), `${test.id}: help newline`);
  }
}

export function buildRust() {
  const result = spawnSync(
    "cargo",
    [
      "build",
      "-p",
      "grida-cli",
      "--bins",
      "--locked",
      "--features",
      "conformance",
      "--message-format=json",
    ],
    {
      cwd: repository,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 16 * 1024 * 1024,
    }
  );
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    "Rust build failed before conformance execution"
  );
  const binaries = new Map();
  for (const line of result.stdout.split("\n").filter(Boolean)) {
    const message = JSON.parse(line);
    if (
      message.reason === "compiler-artifact" &&
      message.executable &&
      message.target.kind.includes("bin")
    )
      binaries.set(message.target.name, message.executable);
  }
  for (const name of ["grida", "grida-conformance"])
    assert(binaries.has(name), `Missing built Rust executable: ${name}`);
  return binaries;
}

/** Actual executables drive CLI cases; parser admission uses a feature-gated driver. */
export async function runCase(test, binaries) {
  const parse = test.mode === "parse";
  const command = binaries.get(parse ? "grida-conformance" : "grida");
  assert(command, "Missing freshly built contract executable");
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-conformance-"))
  );
  try {
    const home = path.join(root, "home");
    await mkdir(home);
    // No inherited credentials, NODE_OPTIONS, proxy configuration or real home.
    const env = {
      PATH: process.env.PATH,
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: home,
      GRIDA_HOME: path.join(home, "grida"),
      GRIDA_CLI_LOCAL_CONFIG: path.join(
        root,
        "deliberately-absent-registration.json"
      ),
      NO_COLOR: "1",
      TERM: "dumb",
      LANG: "C.UTF-8",
    };
    const result = spawnSync(command, parse ? [] : test.argv, {
      cwd: root,
      env,
      encoding: "utf8",
      input: parse
        ? JSON.stringify({ argv: test.argv }) + "\n"
        : (test.stdin ?? ""),
      timeout: 5_000,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
    });
    // Bind version expectations to reviewed package metadata, never process output.
    const version = test.expected.stdout.version
      ? JSON.parse(
          await readFile(
            path.join(repository, "packages/grida-cli/package.json"),
            "utf8"
          )
        ).version
      : undefined;
    assertResult(test, result, version);
    assert.deepEqual(
      await readdir(home),
      [],
      `${test.id}: offline command mutated its home`
    );
    assert.deepEqual(
      await readdir(root),
      ["home"],
      `${test.id}: offline command created working-directory files`
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
