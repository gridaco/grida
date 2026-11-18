// GRIDA-SEC-004 — development uses private staged binaries, never PATH lookup.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stageNativeAgent } from "./native-agent-package.mjs";

import { stageBundledPrograms } from "./bundled-programs.mjs";

const desktop = fileURLToPath(new URL("../", import.meta.url));
const workspace = fileURLToPath(new URL("../../", import.meta.url));
// Native Windows chat is unavailable until the host has ACL-aware private state.
if (process.platform !== "win32") {
  execFileSync(
    "cargo",
    [
      "build",
      "--locked",
      "-p",
      "grida-agent",
      "--bin",
      "grida-agent",
      "-p",
      "agent-kit-sandbox",
      "--bin",
      "agent-kit-sandbox-helper",
    ],
    { cwd: workspace, stdio: "inherit" }
  );
  // Forge removes its entire .vite tree before starting the development app.
  const resources = path.join(desktop, ".native-resources");
  const artifacts = fs.mkdtempSync(path.join(desktop, ".native-artifacts-"));
  try {
    const output = path.join(artifacts, `${process.platform}-${process.arch}`);
    fs.mkdirSync(output);
    const target =
      process.env.CARGO_TARGET_DIR ?? path.join(workspace, "target");
    for (const name of ["grida-agent", "agent-kit-sandbox-helper"]) {
      fs.copyFileSync(
        path.resolve(workspace, target, "debug", name),
        path.join(output, name)
      );
      const file = path.join(output, name);
      fs.chmodSync(file, 0o755);
      // Keep the original debug binary for Rust debugging. Strip symbols only
      // from the host copy, as the release build does: retaining Rust's global
      // debug symbol table can exceed the executable resource limit. macOS
      // keeps undefined and dynamically referenced symbols for runtime linking.
      execFileSync(
        "strip",
        process.platform === "darwin"
          ? ["-u", "-r", file]
          : ["--strip-all", file]
      );
      if (process.platform === "darwin") {
        execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", file]);
      }
    }
    fs.mkdirSync(resources, { recursive: true });
    fs.rmSync(path.join(resources, "native-agent"), {
      recursive: true,
      force: true,
    });
    stageNativeAgent(resources, artifacts, process.platform, process.arch);
    fs.rmSync(path.join(resources, "bundled-programs"), {
      recursive: true,
      force: true,
    });
    stageBundledPrograms(resources, process.platform, process.arch);
  } finally {
    fs.rmSync(artifacts, { recursive: true, force: true });
  }
}
