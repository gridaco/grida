import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const source = path.join(root, "packages/grida-cli");
export const platforms = JSON.parse(
  await readFile(path.join(source, "native/platforms.json"), "utf8")
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const binaryName = (platform) =>
  platform.os === "win32" ? "grida.exe" : "grida";
const EXACT_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const integrityOf = (bytes) =>
  "sha512-" + createHash("sha512").update(bytes).digest("base64");

/** Grida FX, the one dependency: `grida fx` runs the version grida pins. */
export const FX = "@grida/fx";
const LIFECYCLE = ["preinstall", "install", "postinstall", "prepare"];

/** The exact @grida/fx version a source manifest pins; nothing else may be a dependency. */
export function fxVersion(sourceManifest) {
  for (const field of [
    "optionalDependencies",
    "peerDependencies",
    "bundleDependencies",
    "bundledDependencies",
  ])
    assert.equal(sourceManifest[field], undefined, `grida has no ${field}`);
  const dependencies = sourceManifest.dependencies ?? {};
  assert.deepEqual(
    Object.keys(dependencies),
    [FX],
    "grida depends on exactly @grida/fx"
  );
  assert(
    EXACT_VERSION.test(dependencies[FX]),
    "grida pins @grida/fx to one exact version"
  );
  return dependencies[FX];
}

export function packageManifest(sourceManifest) {
  assert.equal(sourceManifest.name, "grida");
  assert(EXACT_VERSION.test(sourceManifest.version));
  const fx = fxVersion(sourceManifest);
  const {
    name,
    version,
    description,
    homepage,
    license,
    repository,
    private: privatePackage,
  } = sourceManifest;
  return {
    name,
    version,
    private: privatePackage,
    description,
    homepage,
    license,
    repository,
    type: "module",
    bin: { grida: "./native/bin.mjs" },
    dependencies: { [FX]: fx },
    files: [
      "native/bin.mjs",
      "native/update.mjs",
      "native/platforms.json",
      "native/licenses.json",
      "THIRD-PARTY-NOTICES.txt",
      "binaries",
    ],
    engines: { node: ">=24.0.0" },
    grida_native: 2,
  };
}

/** Catch mislabelled target artifacts without executing an untrusted architecture. */
export function binaryHeader(bytes, platform) {
  assert(bytes.length >= 64, "Native executable is too short");
  if (platform.os === "darwin") {
    assert.equal(
      bytes.readUInt32LE(0),
      0xfeedfacf,
      "Expected a 64-bit Mach-O executable"
    );
    assert.equal(
      bytes.readUInt32LE(4),
      platform.cpu === "arm64" ? 0x0100000c : 0x01000007,
      "Mach-O architecture does not match target"
    );
    assert.equal(
      bytes.readUInt32LE(12),
      2,
      "Expected an executable Mach-O image"
    );
  } else if (platform.os === "linux") {
    assert.equal(
      bytes.subarray(0, 4).toString("hex"),
      "7f454c46",
      "Expected an ELF executable"
    );
    assert.equal(bytes[4], 2, "Expected 64-bit ELF");
    assert.equal(bytes[5], 1, "Expected little-endian ELF");
    assert(
      [2, 3].includes(bytes.readUInt16LE(16)),
      "Expected executable/PIE ELF"
    );
    assert.equal(
      bytes.readUInt16LE(18),
      platform.cpu === "arm64" ? 183 : 62,
      "ELF architecture does not match target"
    );
  } else {
    assert.equal(
      bytes.subarray(0, 2).toString(),
      "MZ",
      "Expected a Windows PE executable"
    );
    const offset = bytes.readUInt32LE(0x3c);
    assert(
      offset >= 64 && offset + 26 <= bytes.length,
      "Invalid PE header offset"
    );
    assert.equal(
      bytes.readUInt32LE(offset),
      0x00004550,
      "Expected PE signature"
    );
    assert.equal(
      bytes.readUInt16LE(offset + 4),
      platform.cpu === "arm64" ? 0xaa64 : 0x8664,
      "PE architecture does not match target"
    );
    assert.equal(
      bytes.readUInt16LE(offset + 24),
      0x20b,
      "Expected a 64-bit PE image"
    );
  }
}

export async function npmProgram() {
  const directory = path.dirname(process.execPath);
  const candidates =
    process.platform === "win32"
      ? [path.join(directory, "node_modules/npm/bin/npm-cli.js")]
      : [
          path.join(directory, "npm"),
          path.join(directory, "../lib/node_modules/npm/bin/npm-cli.js"),
        ];
  for (const candidate of candidates) {
    try {
      const resolved = await realpath(candidate);
      if (path.basename(resolved) === "npm-cli.js") return resolved;
    } catch {}
  }
  throw new Error("Cannot locate this Node installation's companion npm CLI.");
}

export async function npmRun(args, scratch, options = {}) {
  await writeFile(path.join(scratch, "user.npmrc"), "");
  await writeFile(path.join(scratch, "global.npmrc"), "");
  return exec(process.execPath, [await npmProgram(), ...args], {
    cwd: scratch,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(
        path.delimiter
      ),
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      // npm resolves the OS home before reading the explicit config paths.
      // Container users may have only a numeric UID, with no passwd entry.
      HOME: scratch,
      USERPROFILE: scratch,
      TMPDIR: scratch,
      TEMP: scratch,
      TMP: scratch,
      npm_config_cache: path.join(scratch, "cache"),
      npm_config_userconfig: path.join(scratch, "user.npmrc"),
      npm_config_globalconfig: path.join(scratch, "global.npmrc"),
      npm_config_update_notifier: "false",
    },
    ...options,
  });
}

function allowedFiles(record, manifest) {
  const expected = [
    "package.json",
    "LICENSE",
    "README.md",
    "native/bin.mjs",
    "native/update.mjs",
    "native/platforms.json",
    "native/licenses.json",
    "THIRD-PARTY-NOTICES.txt",
    ...platforms.map((platform) => bundledBinaryPath(platform)),
  ];
  const names = record.files.map((item) => item.path);
  assert.deepEqual(
    names.slice().sort(),
    expected.sort(),
    `Unexpected packed boundary for ${manifest.name}`
  );
  assert.equal(new Set(names).size, names.length);
}

export function bundledBinaryPath(platform) {
  return `binaries/${platform.id}/${binaryName(platform)}`;
}

async function pack(directory, archives, scratch, manifest) {
  const { stdout } = await npmRun(
    [
      "pack",
      directory,
      "--pack-destination",
      archives,
      "--json",
      "--offline",
      "--ignore-scripts",
    ],
    scratch
  );
  const [record] = JSON.parse(stdout);
  assert.equal(record.name, manifest.name);
  assert.equal(record.version, manifest.version);
  assert.equal(path.basename(record.filename), record.filename);
  allowedFiles(record, manifest);
  const bytes = await readFile(path.join(archives, record.filename));
  return {
    name: record.name,
    version: record.version,
    archive: record.filename,
    sha256: sha256(bytes),
    bytes: bytes.length,
    unpacked_bytes: record.unpackedSize,
    files: record.files.map(({ path: filename, size, mode }) => ({
      path: filename,
      size,
      mode,
    })),
  };
}

async function archiveManifest(archive) {
  return JSON.parse(
    (
      await exec(
        "tar",
        ["-xOzf", path.basename(archive), "package/package.json"],
        {
          cwd: path.dirname(archive),
          timeout: 20_000,
          maxBuffer: 1024 * 1024,
        }
      )
    ).stdout
  );
}

/** One dependency archive as the candidate records it, from its own bytes and manifest. */
async function dependencyRecord(archive) {
  const bytes = await readFile(archive);
  const manifest = await archiveManifest(archive);
  return {
    name: manifest.name,
    version: manifest.version,
    archive: path.basename(archive),
    sha256: sha256(bytes),
    integrity: integrityOf(bytes),
    bytes: bytes.length,
    os: manifest.os ?? null,
    cpu: manifest.cpu ?? null,
    libc: manifest.libc ?? null,
  };
}

/**
 * Hold the dependency archives to the pin: @grida/fx at exactly `version` first, then exactly
 * the engine packages it pins as optional dependencies. None runs an install script or brings
 * another dependency.
 */
async function checkDependencies(records, directory, version) {
  assert(records.length >= 1, "The candidate carries @grida/fx");
  const [fx, ...engines] = records;
  assert.equal(fx.name, FX);
  assert.equal(fx.version, version);
  const manifests = [];
  for (const record of records) {
    assert(/^[A-Za-z0-9._-]+\.tgz$/.test(record.archive));
    const archive = path.join(directory, record.archive);
    const stat = await lstat(archive);
    assert(stat.isFile() && stat.size > 0 && stat.size <= 256 * 1024 * 1024);
    const bytes = await readFile(archive);
    assert.equal(bytes.length, record.bytes);
    assert.equal(sha256(bytes), record.sha256);
    assert.equal(integrityOf(bytes), record.integrity);
    const manifest = await archiveManifest(archive);
    assert.equal(manifest.name, record.name);
    assert.equal(manifest.version, record.version);
    assert.equal(
      manifest.dependencies,
      undefined,
      `${record.name} has dependencies`
    );
    for (const script of LIFECYCLE)
      assert.equal(
        manifest.scripts?.[script],
        undefined,
        `${record.name} has an install script`
      );
    manifests.push(manifest);
  }
  const pinned = manifests[0].optionalDependencies ?? {};
  assert.deepEqual(
    engines.map((record) => [record.name, record.version]),
    Object.entries(pinned).sort(([a], [b]) => a.localeCompare(b)),
    "The candidate carries exactly the engine packages @grida/fx pins"
  );
  for (const record of engines) {
    assert(Array.isArray(record.os) && Array.isArray(record.cpu));
  }
}

/** Pack @grida/fx and the engine packages it pins from the public registry; npm checks each
 * archive against the registry's integrity. */
async function fetchDependencies(version, directory, scratch) {
  const packed = async (spec) => {
    const { stdout } = await npmRun(
      [
        "pack",
        spec,
        "--pack-destination",
        directory,
        "--json",
        "--ignore-scripts",
        "--registry",
        "https://registry.npmjs.org",
      ],
      scratch,
      { timeout: 300_000 }
    );
    const [record] = JSON.parse(stdout);
    return path.join(directory, record.filename);
  };
  const fx = await packed(`${FX}@${version}`);
  const engines = Object.entries(
    (await archiveManifest(fx)).optionalDependencies ?? {}
  ).sort(([a], [b]) => a.localeCompare(b));
  const archives = [fx];
  for (const [name, pinned] of engines)
    archives.push(await packed(`${name}@${pinned}`));
  return archives;
}

/**
 * Prepare the candidate: the package with all eight executables, and the exact @grida/fx
 * archives it pins (`dependencies/`), so installed proofs stay offline. `fxArchives` supplies
 * them instead of the registry (test fixtures only: publication refuses them).
 */
export async function prepareNative({ artifacts, out, fxArchives }) {
  assert(
    path.isAbsolute(artifacts) && path.isAbsolute(out),
    "Use absolute artifact/output directories"
  );
  const manifest = packageManifest(
    JSON.parse(await readFile(path.join(source, "package.json"), "utf8"))
  );
  const licenses = JSON.parse(
    await readFile(path.join(source, "native/licenses.json"), "utf8")
  );
  assert.equal(
    licenses.cargo_lock_sha256,
    sha256(await readFile(path.join(root, "Cargo.lock"))),
    "Refresh native license notices after lockfile changes"
  );
  const scratch = await mkdtemp(path.join(tmpdir(), "grida-native-pack-"));
  let created = false;
  try {
    await mkdir(out, { mode: 0o700 });
    created = true;
    const main = path.join(out, "package");
    const archives = path.join(out, "archives");
    const dependencyArchives = path.join(out, "dependencies");
    await mkdir(path.join(main, "native"), { recursive: true });
    await mkdir(archives);
    await mkdir(dependencyArchives);
    const fx = manifest.dependencies[FX];
    const fetched = fxArchives
      ? fxArchives
      : await fetchDependencies(fx, dependencyArchives, scratch);
    const dependencies = [];
    for (const archive of fetched) {
      const target = path.join(dependencyArchives, path.basename(archive));
      if (archive !== target) await copyFile(archive, target);
      dependencies.push(await dependencyRecord(target));
    }
    await checkDependencies(dependencies, dependencyArchives, fx);
    await writeFile(path.join(main, "package.json"), json(manifest));
    for (const file of [
      "bin.mjs",
      "update.mjs",
      "platforms.json",
      "licenses.json",
    ])
      await copyFile(
        path.join(source, "native", file),
        path.join(main, "native", file)
      );
    await chmod(path.join(main, "native/bin.mjs"), 0o755);
    for (const file of ["README.md", "THIRD-PARTY-NOTICES.txt"])
      await copyFile(path.join(source, file), path.join(main, file));
    await copyFile(path.join(root, "LICENSE"), path.join(main, "LICENSE"));
    const binaries = [];
    for (const platform of platforms) {
      const binary = path.join(
        artifacts,
        platform.target,
        binaryName(platform)
      );
      const stat = await lstat(binary);
      assert(
        stat.isFile() && stat.size > 0 && stat.size <= 256 * 1024 * 1024,
        "Expected a bounded regular executable"
      );
      const bytes = await readFile(binary);
      binaryHeader(bytes, platform);
      const filename = bundledBinaryPath(platform);
      await mkdir(path.dirname(path.join(main, filename)), { recursive: true });
      await copyFile(binary, path.join(main, filename));
      await chmod(path.join(main, filename), 0o755);
      binaries.push({
        platform: platform.id,
        target: platform.target,
        path: filename,
        binary_sha256: sha256(bytes),
        binary_bytes: bytes.length,
      });
    }
    const record = await pack(main, archives, scratch, manifest);
    const report = {
      format: 2,
      name: manifest.name,
      version: manifest.version,
      package: record,
      binaries,
      dependencies,
      ...(fxArchives ? { fixture_dependencies: true } : {}),
    };
    await writeFile(path.join(out, "native-candidate.json"), json(report), {
      mode: 0o600,
    });
    return report;
  } catch (error) {
    if (created) await rm(out, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export async function verifyNative(out) {
  assert(path.isAbsolute(out));
  const inventory = JSON.parse(
    await readFile(path.join(source, "native/licenses.json"), "utf8")
  );
  assert.equal(
    inventory.cargo_lock_sha256,
    sha256(await readFile(path.join(root, "Cargo.lock"))),
    "Refresh native license notices after changing Cargo.lock"
  );
  const report = JSON.parse(
    await readFile(path.join(out, "native-candidate.json"), "utf8")
  );
  assert.equal(report.format, 2);
  const manifest = packageManifest(
    JSON.parse(await readFile(path.join(source, "package.json"), "utf8"))
  );
  assert.equal(report.version, manifest.version);
  assert.equal(report.name, manifest.name);
  assert.deepEqual(
    report.binaries.map((p) => p.platform),
    platforms.map((p) => p.id)
  );
  const record = report.package;
  assert.equal(record.name, manifest.name);
  assert.equal(record.version, manifest.version);
  assert(/^[A-Za-z0-9._-]+\.tgz$/.test(record.archive));
  const archive = path.join(out, "archives", record.archive);
  const stat = await lstat(archive);
  assert(stat.isFile() && stat.size > 0 && stat.size <= 256 * 1024 * 1024);
  const bytes = await readFile(archive);
  assert.equal(bytes.length, record.bytes);
  assert.equal(sha256(bytes), record.sha256);
  // GNU tar interprets a Windows drive colon in -f as a remote host.
  // The validated basename stays local with both GNU and BSD tar.
  const options = {
    cwd: path.dirname(archive),
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
  };
  const listing = (await exec("tar", ["-tzf", record.archive], options)).stdout
    .trim()
    .split("\n");
  assert(listing.every((name) => name.startsWith("package/")));
  assert.deepEqual(
    listing.map((name) => name.slice(8)).sort(),
    record.files.map((file) => file.path).sort()
  );
  allowedFiles(record, manifest);
  const packedManifest = JSON.parse(
    (
      await exec(
        "tar",
        ["-xOzf", record.archive, "package/package.json"],
        options
      )
    ).stdout
  );
  assert.deepEqual(packedManifest, manifest);
  for (const file of [
    "README.md",
    "THIRD-PARTY-NOTICES.txt",
    "native/bin.mjs",
    "native/update.mjs",
    "native/platforms.json",
    "native/licenses.json",
  ]) {
    const packed = (
      await exec("tar", ["-xOzf", record.archive, `package/${file}`], options)
    ).stdout;
    assert.equal(packed, await readFile(path.join(source, file), "utf8"));
  }
  assert.equal(
    (await exec("tar", ["-xOzf", record.archive, "package/LICENSE"], options))
      .stdout,
    await readFile(path.join(root, "LICENSE"), "utf8")
  );
  for (const [index, platform] of platforms.entries()) {
    const binary = report.binaries[index];
    assert.equal(binary.target, platform.target);
    assert.equal(binary.path, bundledBinaryPath(platform));
    const packed = (
      await exec("tar", ["-xOzf", record.archive, `package/${binary.path}`], {
        ...options,
        encoding: "buffer",
        maxBuffer: 256 * 1024 * 1024,
      })
    ).stdout;
    binaryHeader(packed, platform);
    assert.equal(packed.length, binary.binary_bytes);
    assert.equal(sha256(packed), binary.binary_sha256);
  }
  await checkDependencies(
    report.dependencies ?? [],
    path.join(out, "dependencies"),
    manifest.dependencies[FX]
  );
  return report;
}

async function main() {
  const { values } = parseArgs({
    options: {
      artifacts: { type: "string" },
      out: { type: "string" },
      verify: { type: "boolean" },
      matrix: { type: "boolean" },
    },
  });
  if (values.matrix) {
    assert(!values.out && !values.artifacts && !values.verify);
    process.stdout.write(json({ include: platforms }));
    return;
  }
  assert(values.out, "--out is required");
  const report = values.verify
    ? await verifyNative(values.out)
    : await prepareNative({ artifacts: values.artifacts, out: values.out });
  process.stdout.write(json(report));
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof assert.AssertionError ? error.message : "Native candidate preparation failed."}\n`
    );
    process.exitCode = 1;
  });
