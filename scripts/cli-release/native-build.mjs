import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { binaryHeader, platforms } from "./native.mjs";
import { verifyGlibcBaseline } from "./native-abi.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const { values } = parseArgs({
  options: { target: { type: "string" }, out: { type: "string" } },
});
const platform = platforms.find((p) => p.target === values.target);
assert(
  platform && values.out && path.isAbsolute(values.out),
  "Choose a reviewed target and absolute output directory"
);
assert.equal(
  process.platform,
  platform.os,
  "Build on the target operating system"
);
assert.equal(process.arch, platform.cpu, "Build on the target architecture");
const targetDir = path.join(root, "target/native");
const environment = {
  ...process.env,
  CARGO_PROFILE_RELEASE_STRIP: "symbols",
  CARGO_PROFILE_RELEASE_LTO: "thin",
  CARGO_PROFILE_RELEASE_CODEGEN_UNITS: "1",
};
if (platform.os === "darwin") environment.MACOSX_DEPLOYMENT_TARGET = "11.0";
if (platform.libc === "musl") {
  environment[
    `CARGO_TARGET_${platform.target.replaceAll("-", "_").toUpperCase()}_LINKER`
  ] = "musl-gcc";
  environment[`CC_${platform.target.replaceAll("-", "_")}`] = "musl-gcc";
}
let abi;
if (platform.libc === "glibc") {
  const toolchain = /channel\s*=\s*"(\d+\.\d+\.\d+)"/.exec(
    await readFile(path.join(root, "rust-toolchain.toml"), "utf8")
  )?.[1];
  assert(toolchain, "GNU builds require an exact reviewed Rust toolchain");
  await mkdir(targetDir, { recursive: true });
  const image = `quay.io/pypa/manylinux_2_28_${platform.cpu === "x64" ? "x86_64" : "aarch64"}`;
  await exec(
    "docker",
    [
      "run",
      "--rm",
      "--platform",
      platform.cpu === "x64" ? "linux/amd64" : "linux/arm64",
      "-v",
      `${root}:/repo:ro`,
      "-v",
      `${targetDir}:/target`,
      "-w",
      "/repo",
      "-e",
      `GRIDA_RUST_TOOLCHAIN=${toolchain}`,
      "-e",
      `GRIDA_RUST_TARGET=${platform.target}`,
      image,
      "bash",
      "scripts/cli-release/native-linux.sh",
    ],
    { cwd: root, timeout: 30 * 60_000, maxBuffer: 8 * 1024 * 1024 }
  );
  abi = verifyGlibcBaseline(
    await readFile(
      path.join(targetDir, platform.target, "glibc-versions.txt"),
      "utf8"
    ),
    await readFile(
      path.join(targetDir, platform.target, "dynamic-libraries.txt"),
      "utf8"
    )
  );
} else {
  await exec("rustup", ["target", "add", platform.target], {
    cwd: root,
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  await exec(
    "cargo",
    [
      "build",
      "--locked",
      "--release",
      "-p",
      "grida-cli",
      "--bin",
      "grida",
      "--target",
      platform.target,
      "--target-dir",
      targetDir,
    ],
    {
      cwd: root,
      env: environment,
      timeout: 30 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
    }
  );
}
const name = platform.os === "win32" ? "grida.exe" : "grida";
const binary = path.join(targetDir, platform.target, "release", name);
const bytes = await readFile(binary);
binaryHeader(bytes, platform);
const manifest = JSON.parse(
  await readFile(path.join(root, "packages/grida-cli/package.json"), "utf8")
);
assert.equal(
  (await exec(binary, ["--version"], { timeout: 10_000 })).stdout.trim(),
  `grida ${manifest.version}`
);
await exec(binary, ["--help"], { timeout: 10_000 });
await mkdir(values.out, { recursive: true });
const destination = path.join(values.out, platform.target);
await mkdir(destination);
await copyFile(binary, path.join(destination, name));
await chmod(path.join(destination, name), 0o755);
await writeFile(
  path.join(destination, "artifact.json"),
  JSON.stringify(
    {
      target: platform.target,
      version: manifest.version,
      source_revision: process.env.GITHUB_SHA ?? null,
      cargo_lock_sha256: createHash("sha256")
        .update(await readFile(path.join(root, "Cargo.lock")))
        .digest("hex"),
      binary_sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      ...(abi ? { abi } : {}),
    },
    null,
    2
  ) + "\n"
);
process.stdout.write(
  `${platform.target}: ${bytes.length} bytes; native --version and --help passed\n`
);
