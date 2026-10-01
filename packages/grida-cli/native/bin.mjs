#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { constants } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const platforms = JSON.parse(
  readFileSync(new URL("./platforms.json", import.meta.url), "utf8")
);

export function selectPlatform(
  platform = process.platform,
  arch = process.arch,
  report
) {
  const libc =
    platform === "linux"
      ? (report ?? process.report.getReport()).header.glibcVersionRuntime
        ? "glibc"
        : "musl"
      : undefined;
  return platforms.find(
    (item) => item.os === platform && item.cpu === arch && item.libc === libc
  );
}

export function binaryPath() {
  const selected = selectPlatform();
  if (!selected)
    throw new Error(
      `Grida does not support ${process.platform}/${process.arch}.`
    );
  const own = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  );
  const name = `@grida/cli-${selected.id}`;
  let manifestPath;
  try {
    manifestPath = createRequire(import.meta.url).resolve(
      `${name}/package.json`
    );
  } catch {
    throw new Error(
      `Grida's native package ${name}@${own.version} is missing. Reinstall with npm install --include=optional grida@${own.version}.`
    );
  }
  const installed = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (installed.name !== name || installed.version !== own.version)
    throw new Error(
      "Grida's native package version does not match the launcher. Reinstall Grida."
    );
  return path.join(
    path.dirname(manifestPath),
    "bin",
    selected.os === "win32" ? "grida.exe" : "grida"
  );
}

export function launch(args = process.argv.slice(2)) {
  let executable;
  try {
    executable = binaryPath();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const child = spawn(executable, args, {
    stdio: "inherit",
    windowsHide: false,
  });
  const signals =
    process.platform === "win32"
      ? ["SIGINT", "SIGTERM"]
      : ["SIGINT", "SIGTERM", "SIGHUP"];
  const forwarders = new Map(
    signals.map((signal) => [
      signal,
      () => {
        if (!child.killed) child.kill(signal);
      },
    ])
  );
  for (const [signal, forward] of forwarders) process.on(signal, forward);
  const cleanup = () => {
    for (const [signal, forward] of forwarders)
      process.removeListener(signal, forward);
  };
  child.once("error", () => {
    cleanup();
    process.stderr.write(
      "Grida's native executable could not start. Reinstall Grida for this platform.\n"
    );
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    cleanup();
    if (signal) {
      // Preserve POSIX termination semantics for shells and supervising tools.
      try {
        process.kill(process.pid, signal);
      } catch {
        process.exitCode = 128 + (constants.signals[signal] ?? 1);
      }
    } else {
      process.exitCode = code ?? 1;
    }
  });
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
)
  launch();
