// Durable integration checks use ordinary Cargo and node:test commands.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const repository = fileURLToPath(new URL("../../", import.meta.url));

export const checks = [
  {
    id: "proof.rust-workspace",
    description:
      "Native auth, callback, custody, provider, host, HTTP, file, input, and all provider operation tests",
    commands: [["cargo", "test", "--workspace", "--all-features", "--locked"]],
    assertion: "rust_tests",
  },
  {
    id: "proof.auth-mixed",
    description: "Current TS/Rust real-process custody pairings",
    commands: [["node", "--test", "scripts/conformance/auth-process.test.mjs"]],
    assertion: "node_tests",
  },
  {
    id: "proof.auth-native",
    description: "Native keytar interoperability on the current supported OS",
    commands: [
      ["node", "--test", "scripts/conformance/auth-macos.test.mjs"],
      ...(process.platform === "linux"
        ? [["sh", "scripts/conformance/auth-linux.sh"]]
        : process.env.GRIDA_AUTH_MACOS_CI === "1"
          ? [["node", "scripts/conformance/auth-macos.mjs"]]
          : [["node", "--test", "scripts/conformance/auth-keyring.test.mjs"]]),
    ],
    assertion: "node_tests",
  },
  {
    id: "proof.catalogue-consumers",
    description:
      "Current TS/web projections satisfy the reviewed contract vectors; generated bundled assets are current",
    commands: [
      ["pnpm", "exec", "turbo", "run", "build", "--filter=@grida/ai..."],
      ...["media", "inputs", "errors"].map((name) => [
        "node",
        `scripts/conformance/catalogue-${name}.mjs`,
        "--check",
      ]),
      [
        "node",
        "packages/grida-ai-models/scripts/generate.mjs",
        "--bundle",
        "--check",
      ],
    ],
  },
  {
    id: "proof.installed-native",
    description:
      "Local OAuth/account/provider/GG/artifact/signal scenarios through the npm-installed Rust binary",
    commands: [["node", "scripts/conformance/installed.mjs"]],
    assertion: "json_proof",
  },
  {
    id: "proof.npm-delivery",
    description:
      "Actual host npm installation, exact target/version selection, streams/signals, artifact and release guards",
    commands: [["node", "--test", "scripts/cli-release/native.test.mjs"]],
    assertion: "node_tests",
  },
  {
    id: "proof.installed-docs",
    description:
      "Installed command/help/docs and guide examples match the built documentation",
    commands: [["node", "--import", "tsx", "scripts/conformance/docs.mjs"]],
    assertion: "json_proof",
  },
];

export function assertCheck(check, output) {
  if (check.assertion === "rust_tests") {
    assert.match(output, /test result: ok\. [1-9]\d* passed;/);
    assert.doesNotMatch(output, /test result: FAILED/);
  } else if (check.assertion === "node_tests") {
    assert.match(output, /(?:#|ℹ) (?:tests|pass) [1-9]\d*/);
    assert.match(output, /(?:#|ℹ) fail 0/);
    assert.match(output, /(?:#|ℹ) skipped 0/);
  } else if (check.assertion === "json_proof") {
    assert.equal(JSON.parse(output).passed, true);
  }
}

export function runCheck(check) {
  for (const [command, ...args] of check.commands) {
    const result = spawnSync(
      command === "node" ? process.execPath : command,
      args,
      {
        cwd: repository,
        encoding: "utf8",
        timeout: 20 * 60 * 1000,
        maxBuffer: 16 * 1024 * 1024,
      }
    );
    if (result.error) throw result.error;
    assert.equal(result.signal, null, `${check.id}: terminated by signal`);
    assert.equal(
      result.status,
      0,
      `${check.id}: ${result.stderr}\n${result.stdout}`
    );
    assertCheck(check, result.stdout);
  }
}
