import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { npmRun, verifyNative } from "./native.mjs";
import { selectPlatform } from "../../packages/grida-cli/native/bin.mjs";

const exec = promisify(execFile);

class NativeProofError extends Error {
  constructor(stage, cause) {
    const code = cause?.code;
    const detail = Number.isInteger(code)
      ? ` (exit ${code})`
      : ["ENOENT", "EACCES", "EPERM", "ENOTDIR", "ENOSPC"].includes(code)
        ? ` (${code})`
        : "";
    super(`Installed native candidate proof failed at ${stage}${detail}.`, {
      cause,
    });
  }
}

async function proofStep(stage, operation) {
  try {
    return await operation();
  } catch (error) {
    throw new NativeProofError(stage, error);
  }
}

/** Install the verified host pair into a caller-owned directory; caller cleans up. */
export async function installNative(out, runtime) {
  assert(path.isAbsolute(runtime));
  const report = await proofStep("candidate_verification", () =>
    verifyNative(out)
  );
  const platform = selectPlatform();
  assert(platform, "Unsupported proof host");
  const selected = report.platforms.find(
    (item) => item.platform === platform.id
  );
  await mkdir(runtime, { recursive: true });
  await proofStep("offline_npm_install", () =>
    npmRun(
      [
        "install",
        path.join(out, "archives", report.launcher.archive),
        path.join(out, "archives", selected.archive),
        "--offline",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--omit=dev",
      ],
      runtime
    )
  );
  const launcher = path.join(runtime, "node_modules/grida/native/bin.mjs");
  const executable = path.join(
    runtime,
    "node_modules",
    selected.name,
    "bin",
    platform.os === "win32" ? "grida.exe" : "grida"
  );
  const hash = createHash("sha256")
    .update(await readFile(executable))
    .digest("hex");
  assert.equal(hash, selected.binary_sha256);
  const installed = JSON.parse(
    await readFile(
      path.join(runtime, "node_modules/grida/package.json"),
      "utf8"
    )
  );
  assert.equal(installed.version, report.version);
  assert(
    Object.values(installed.optionalDependencies).every(
      (version) => version === report.version
    )
  );
  return {
    report,
    platform,
    selected,
    launcher,
    executable,
    binary_sha256: hash,
  };
}

export async function proveNative(out) {
  // Exercise the npm shim with a space-containing path on every proof host.
  const scratch = await mkdtemp(path.join(tmpdir(), "grida native install-"));
  let stage = "installed_metadata";
  try {
    const {
      report,
      platform,
      selected,
      launcher,
      binary_sha256: hash,
    } = await installNative(out, scratch);
    const options = {
      cwd: scratch,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      env: {
        PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(
          path.delimiter
        ),
        ...(process.env.SystemRoot
          ? { SystemRoot: process.env.SystemRoot }
          : {}),
        GRIDA_HOME: path.join(scratch, "profile"),
      },
    };
    stage = "version";
    const version = await exec(
      process.execPath,
      [launcher, "--version"],
      options
    );
    assert.equal(version.stdout.trim(), `grida ${report.version}`);
    assert.equal(version.stderr, "");
    stage = "help";
    const help = await exec(process.execPath, [launcher, "--help"], options);
    assert(help.stdout.includes("grida"));
    assert.equal(help.stderr, "");
    stage = "docs";
    const docs = await exec(
      process.execPath,
      [launcher, "docs", "providers"],
      options
    );
    assert(docs.stdout.startsWith("https://grida.co/docs/cli"));
    stage = "usage_exit_2";
    await assert.rejects(
      exec(process.execPath, [launcher, "--definitely-invalid"], options),
      (error) =>
        error.code === 2 && error.stdout === "" && error.stderr.length > 0
    );
    stage = "npm_bin_shim";
    if (process.platform !== "win32") {
      const shim = await exec(
        path.join(scratch, "node_modules/.bin/grida"),
        ["--version"],
        options
      );
      assert.equal(shim.stdout.trim(), `grida ${report.version}`);
    } else {
      const shim = path.join(scratch, "node_modules/.bin/grida.cmd");
      assert(!shim.includes('"'));
      const command = path.join(process.env.SystemRoot, "System32/cmd.exe");
      const invoked = await exec(
        command,
        ["/d", "/s", "/c", `""${shim}" --version"`],
        // The /c command is already quoted for cmd.exe. Node's default
        // Windows argv escaping would add a second, incompatible quote layer.
        { ...options, windowsVerbatimArguments: true }
      );
      assert.equal(invoked.stdout.trim(), `grida ${report.version}`);
    }
    const result = {
      format: 1,
      version: report.version,
      platform: platform.id,
      archive_sha256: report.launcher.sha256,
      native_archive_sha256: selected.sha256,
      binary_sha256: hash,
      checks: [
        "offline_npm_install",
        "exact_optional_version",
        "installed_binary_hash",
        "version",
        "help",
        "docs",
        "usage_exit_2",
        "npm_bin_shim",
      ],
    };
    stage = "write_report";
    await writeFile(
      path.join(out, `installed-${platform.id}.json`),
      JSON.stringify(result, null, 2) + "\n",
      { mode: 0o600 }
    );
    return result;
  } catch (error) {
    if (error instanceof NativeProofError) throw error;
    throw new NativeProofError(stage, error);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  assert(values.out && path.isAbsolute(values.out));
  proveNative(values.out)
    .then((result) =>
      process.stdout.write(JSON.stringify(result, null, 2) + "\n")
    )
    .catch((error) => {
      process.stderr.write(
        `${error instanceof NativeProofError ? error.message : "Installed native candidate proof failed."}\n`
      );
      process.exitCode = 1;
    });
}
