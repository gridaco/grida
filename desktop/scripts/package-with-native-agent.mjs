// GRIDA-SEC-004 — stage locked workspace binaries for a local or CI package.
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { buildNativeAgentArtifacts } from "./native-agent-package.mjs";

const require = createRequire(import.meta.url);
const forgeManifest = require.resolve("@electron-forge/cli/package.json");
const forge = path.join(
  path.dirname(forgeManifest),
  require(forgeManifest).bin["electron-forge"]
);

export function forgeInvocation(command, args) {
  assert(command === "package" || command === "make", "Invalid Forge command");
  assert(
    !args.some(
      (arg) => arg === "--skip-package" || arg.startsWith("--skip-package=")
    ),
    "Desktop installers require a fresh verified package"
  );
  if (args.some((arg) => ["--help", "-h", "--version", "-V"].includes(arg))) {
    return { args: [command, ...args] };
  }
  const { values } = parseArgs({
    args,
    options: {
      arch: { type: "string", short: "a" },
      platform: { type: "string", short: "p" },
    },
    strict: false,
    allowPositionals: true,
  });
  const arch = values.arch ?? process.arch;
  return {
    args: [command, ...(values.arch ? [] : ["--arch", arch]), ...args],
    target: { platform: values.platform ?? process.platform, arch },
  };
}

function runForge(args, artifacts) {
  execFileSync(process.execPath, [forge, ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(artifacts ? { GRIDA_DESKTOP_NATIVE_ARTIFACTS: artifacts } : {}),
    },
  });
}

function buildDesktop(command, args) {
  const invocation = forgeInvocation(command, args);
  if (!invocation.target) return runForge(invocation.args);
  const override = process.env.GRIDA_DESKTOP_NATIVE_ARTIFACTS;
  if (override) {
    assert(
      path.isAbsolute(override),
      "Native agent artifact root must be absolute"
    );
    return runForge(invocation.args, override);
  }
  const artifacts = fs.mkdtempSync(
    path.join(os.tmpdir(), "grida-desktop-agent-")
  );
  try {
    buildNativeAgentArtifacts(
      artifacts,
      invocation.target.platform,
      invocation.target.arch
    );
    runForge(invocation.args, artifacts);
  } finally {
    fs.rmSync(artifacts, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  buildDesktop(command, args);
}
