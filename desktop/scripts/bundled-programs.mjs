// GRIDA-SEC-004 — stage fixed command resources outside app.asar at build time.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readExecutable } from "./native-agent-package.mjs";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const fx = "@grida/fx";
const directory = "bundled-programs";

function fxPackage(platform, arch) {
  if (platform === "win32") return undefined;
  assert(
    ["darwin", "linux"].includes(platform) && ["arm64", "x64"].includes(arch),
    "Unsupported bundled FX platform"
  );
  return `${fx}-${platform}-${arch}${platform === "linux" ? "-gnu" : ""}`;
}

function fxVersion() {
  const { devDependencies } = require(path.join(root, "package.json"));
  const version = devDependencies?.[fx];
  assert(
    /^\d+\.\d+\.\d+$/.test(version),
    "Desktop must pin an exact FX release"
  );
  return version;
}

/** Copy only the target package's reviewed native executable and license. */
export function stageBundledPrograms(resources, platform, arch) {
  const name = fxPackage(platform, arch);
  if (!name) return;
  const version = fxVersion();
  const carrierPath = require.resolve(`${fx}/package.json`);
  const carrier = require(carrierPath);
  assert.equal(
    carrier.version,
    version,
    "Installed FX SDK differs from Desktop pin"
  );
  assert.equal(carrier.optionalDependencies?.[name], version);
  const platformPath = createRequire(carrierPath).resolve(
    `${name}/package.json`
  );
  const source = path.dirname(platformPath);
  const manifest = require(platformPath);
  assert.equal(manifest.name, name);
  assert.equal(
    manifest.version,
    version,
    "Installed FX binary differs from Desktop pin"
  );
  const bytes = readExecutable(
    path.join(source, "bin", "grida-fx"),
    platform,
    arch
  );
  const destination = path.join(resources, directory);
  assert(
    !fs.existsSync(destination),
    "Bundled programs destination already exists"
  );
  const staging = fs.mkdtempSync(path.join(resources, ".bundled-programs-"));
  try {
    const bin = path.join(staging, "bin");
    fs.mkdirSync(bin, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "grida-fx"), bytes, {
      mode: 0o755,
      flag: "wx",
    });
    fs.chmodSync(path.join(bin, "grida-fx"), 0o755);
    fs.copyFileSync(
      path.join(source, "LICENSE"),
      path.join(staging, "FX-LICENSE")
    );
    fs.writeFileSync(path.join(staging, "fx-version"), version + "\n", {
      flag: "wx",
    });
    fs.chmodSync(staging, 0o755);
    fs.renameSync(staging, destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/** Check the staged payload on disk, and execute it on the matching target. */
export function verifyBundledPrograms(resources, platform, arch) {
  const carrier = path.join(resources, directory);
  if (!fxPackage(platform, arch)) {
    assert(!fs.existsSync(carrier), "Unexpected bundled programs for Windows");
    return false;
  }
  assert(fs.lstatSync(carrier).isDirectory());
  assert.deepEqual(fs.readdirSync(carrier).sort(), [
    "FX-LICENSE",
    "bin",
    "fx-version",
  ]);
  const bin = path.join(carrier, "bin");
  assert(fs.lstatSync(bin).isDirectory());
  assert.deepEqual(fs.readdirSync(bin), ["grida-fx"]);
  const file = path.join(bin, "grida-fx");
  readExecutable(file, platform, arch, true);
  const version = fxVersion();
  assert.equal(
    fs.readFileSync(path.join(carrier, "fx-version"), "utf8"),
    version + "\n"
  );
  if (process.platform === platform && process.arch === arch) {
    const reported = execFileSync(file, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 4096,
      env: {},
    });
    assert.equal(reported.trim(), `grida-fx ${version}`);
  }
  return true;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [resources, platform, arch] = process.argv.slice(2);
  stageBundledPrograms(resources, platform, arch);
}
