// GRIDA-SEC-004 — package the fixed native executables outside app.asar.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The shared binary-format check runs in Node's packaging program.
const { binaryHeader } = await import(
  new URL("../../scripts/cli-release/native.mjs", import.meta.url).href
);

const DIRECTORY = "native-agent";
const MAX_BINARY_BYTES = 128 * 1024 * 1024;

function executables(os, cpu) {
  assert(["darwin", "linux", "win32"].includes(os), "Unsupported agent OS");
  assert(
    cpu === "x64" || (cpu === "arm64" && os !== "win32"),
    "Unsupported native agent package architecture"
  );
  return os === "win32"
    ? ["grida-agent.exe"]
    : ["grida-agent", "agent-kit-sandbox-helper"];
}

function readExecutable(file, os, cpu, packaged = false) {
  const before = fs.lstatSync(file);
  assert(before.isFile(), "Native agent artifact must be a regular file");
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY |
      (fs.constants.O_NOFOLLOW ?? 0) |
      (fs.constants.O_NONBLOCK ?? 0)
  );
  try {
    const stat = fs.fstatSync(descriptor);
    assert(
      stat.isFile() && stat.dev === before.dev && stat.ino === before.ino,
      "Native agent artifact changed while opening"
    );
    assert(
      stat.size >= 64 && stat.size <= MAX_BINARY_BYTES,
      "Native agent artifact size is outside the package limit"
    );
    if (packaged && os !== "win32") {
      assert(
        (stat.mode & 0o111) !== 0 && (stat.mode & 0o022) === 0,
        "Packaged native agent executable permissions are unsafe"
      );
    }
    const bytes = Buffer.alloc(stat.size);
    for (let offset = 0; offset < bytes.length; ) {
      const read = fs.readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset
      );
      assert(read > 0, "Native agent artifact changed while reading");
      offset += read;
    }
    const after = fs.fstatSync(descriptor);
    assert(
      after.size === stat.size && after.mtimeMs === stat.mtimeMs,
      "Native agent artifact changed while reading"
    );
    binaryHeader(bytes, { os, cpu });
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

export function stageNativeAgent(resources, artifacts, os, cpu) {
  assert(
    path.isAbsolute(artifacts),
    "Native agent artifact root must be absolute"
  );
  const names = executables(os, cpu);
  const target = path.join(artifacts, `${os}-${cpu}`);
  assert(
    fs.lstatSync(target).isDirectory(),
    "Native agent target must be a directory"
  );
  const destination = path.join(resources, DIRECTORY);
  assert(
    !fs.existsSync(destination),
    "Native agent destination already exists"
  );
  const staging = fs.mkdtempSync(path.join(resources, ".native-agent-"));
  try {
    for (const name of names) {
      const bytes = readExecutable(path.join(target, name), os, cpu);
      const file = path.join(staging, name);
      fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o755 });
      fs.chmodSync(file, 0o755);
    }
    // Packaged resources are consumed by the application's user after install.
    fs.chmodSync(staging, 0o755);
    fs.renameSync(staging, destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function verifyNativeAgent(resources, os, cpu) {
  const names = executables(os, cpu);
  const directory = path.join(resources, DIRECTORY);
  assert(
    fs.lstatSync(directory).isDirectory(),
    "Native agent resources must be a directory"
  );
  assert.deepEqual(
    fs.readdirSync(directory).sort(),
    [...names].sort(),
    "Native agent resource contents do not match the target"
  );
  for (const name of names) {
    readExecutable(path.join(directory, name), os, cpu, true);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [resources, artifacts, os, cpu] = process.argv.slice(2);
  stageNativeAgent(resources, artifacts, os, cpu);
}
