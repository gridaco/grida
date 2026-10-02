#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { constants } from "node:os";
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
  const executable = fileURLToPath(
    new URL(
      `../binaries/${selected.id}/${selected.os === "win32" ? "grida.exe" : "grida"}`,
      import.meta.url
    )
  );
  if (!existsSync(executable))
    throw new Error("Grida's bundled executable is missing. Reinstall Grida.");
  return executable;
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
