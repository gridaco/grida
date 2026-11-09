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
const args = process.argv.slice(2);
const override = process.env.GRIDA_DESKTOP_NATIVE_ARTIFACTS;

function packageDesktop(artifacts, packageArgs = args) {
  execFileSync(process.execPath, [forge, "package", ...packageArgs], {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(artifacts ? { GRIDA_DESKTOP_NATIVE_ARTIFACTS: artifacts } : {}),
    },
  });
}

if (override) {
  assert(
    path.isAbsolute(override),
    "Native agent artifact root must be absolute"
  );
  packageDesktop(override);
} else if (
  args.some((arg) => ["--help", "-h", "--version", "-V"].includes(arg))
) {
  packageDesktop();
} else {
  const { values } = parseArgs({
    args,
    options: {
      arch: { type: "string", short: "a" },
      platform: { type: "string", short: "p" },
    },
    strict: false,
    allowPositionals: true,
  });
  const artifacts = fs.mkdtempSync(
    path.join(os.tmpdir(), "grida-desktop-agent-")
  );
  try {
    buildNativeAgentArtifacts(
      artifacts,
      values.platform ?? process.platform,
      values.arch ?? process.arch
    );
    const packageArgs = values.arch ? args : ["--arch", process.arch, ...args];
    packageDesktop(artifacts, packageArgs);
  } finally {
    fs.rmSync(artifacts, { recursive: true, force: true });
  }
}
