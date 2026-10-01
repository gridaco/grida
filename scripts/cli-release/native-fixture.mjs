// Test-only foreign image headers. These are never executable release artifacts.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { platforms, prepareNative } from "./native.mjs";
import { selectPlatform } from "../../packages/grida-cli/native/bin.mjs";

export async function buildHostFixture(out) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const { stdout } = await promisify(execFile)(
    "cargo",
    [
      "build",
      "--locked",
      "-p",
      "grida-cli",
      "--bin",
      "grida",
      "--message-format=json",
    ],
    { cwd: root, timeout: 30 * 60_000, maxBuffer: 16 * 1024 * 1024 }
  );
  const executable = stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .find(
      (record) =>
        record.reason === "compiler-artifact" &&
        record.target.name === "grida" &&
        record.executable
    )?.executable;
  assert(executable, "Cargo did not produce the native CLI executable");
  return prepareHostFixture(executable, out);
}

export function fixtureBinary(platform) {
  const bytes = Buffer.alloc(512);
  if (platform.os === "darwin") {
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(platform.cpu === "arm64" ? 0x0100000c : 0x01000007, 4);
    bytes.writeUInt32LE(2, 12);
  } else if (platform.os === "linux") {
    bytes.write("\x7fELF", 0, "binary");
    bytes[4] = 2;
    bytes[5] = 1;
    bytes.writeUInt16LE(2, 16);
    bytes.writeUInt16LE(platform.cpu === "arm64" ? 183 : 62, 18);
  } else {
    bytes.write("MZ");
    bytes.writeUInt32LE(128, 0x3c);
    bytes.writeUInt32LE(0x00004550, 128);
    bytes.writeUInt16LE(platform.cpu === "arm64" ? 0xaa64 : 0x8664, 132);
    bytes.writeUInt16LE(0x20b, 152);
  }
  return bytes;
}

export async function prepareHostFixture(binary, out) {
  assert(path.isAbsolute(binary) && path.isAbsolute(out));
  const host = selectPlatform();
  assert(host);
  const scratch = await mkdtemp(path.join(tmpdir(), "grida-native-fixture-"));
  try {
    for (const platform of platforms) {
      const directory = path.join(scratch, platform.target);
      await mkdir(directory);
      const file = path.join(
        directory,
        platform.os === "win32" ? "grida.exe" : "grida"
      );
      if (platform.id === host.id) await copyFile(binary, file);
      else await writeFile(file, fixtureBinary(platform));
    }
    const report = await prepareNative({ artifacts: scratch, out });
    report.fixture_targets = platforms
      .filter((p) => p.id !== host.id)
      .map((p) => p.id);
    await writeFile(
      path.join(out, "native-candidate.json"),
      JSON.stringify(report, null, 2) + "\n",
      { mode: 0o600 }
    );
    return report;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: { binary: { type: "string" }, out: { type: "string" } },
  });
  await prepareHostFixture(values.binary, values.out);
  process.stdout.write(
    "Host-only fixture candidate prepared; foreign targets are inert and publication is refused.\n"
  );
}
