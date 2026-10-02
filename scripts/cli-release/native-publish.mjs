import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { npmProgram, platforms, verifyNative } from "./native.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
export function releaseGuard(manifest, version, tag) {
  assert.equal(manifest.name, "grida");
  assert.equal(manifest.private, false);
  assert.equal(
    manifest.grida_native,
    2,
    "Source package is not configured for the native CLI"
  );
  assert.deepEqual(manifest.bin, { grida: "./native/bin.mjs" });
  assert.equal(manifest.optionalDependencies, undefined);
  assert.equal(manifest.dependencies, undefined);
  assert(manifest.files.includes("binaries"));
  assert.equal(
    version,
    manifest.version,
    "Version differs from reviewed source"
  );
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      version
    );
  assert(
    match && version !== "0.0.0",
    "Choose a non-placeholder release version"
  );
  assert(
    !match[4]
      ?.split(".")
      .some(
        (part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0")
      ),
    "Invalid prerelease version"
  );
  assert(tag === "latest" || tag === "next");
  assert(tag !== "latest" || !match[4], "Prereleases cannot replace latest");
}

export async function verifyInstalledMatrix(out, report) {
  assert(
    !report.fixture_targets?.length,
    "Foreign fixture images cannot be released"
  );
  assert.equal(report.format, 2);
  assert.deepEqual(
    report.binaries.map((p) => p.platform),
    platforms.map((p) => p.id)
  );
  for (const record of report.binaries) {
    const proof = JSON.parse(
      await readFile(
        path.join(out, `installed-${record.platform}.json`),
        "utf8"
      )
    );
    assert.equal(proof.format, 2);
    assert.equal(proof.version, report.version);
    assert.equal(proof.platform, record.platform);
    assert.equal(proof.archive_sha256, report.package.sha256);
    assert.equal(proof.binary_sha256, record.binary_sha256);
    for (const check of [
      "offline_npm_install",
      "exact_package_version",
      "bundled_platform_matrix",
      "installed_binary_hash",
      "version",
      "help",
      "docs",
      "usage_exit_2",
      "npm_bin_shim",
    ])
      assert(
        proof.checks.includes(check),
        `Missing ${check} on ${record.platform}`
      );
  }
}

// The caller must verify the candidate, all eight installed proofs and release authority first.
export async function publishVerifiedArchive(
  record,
  { out, tag, invoke, log = (message) => process.stdout.write(message) }
) {
  assert.equal(record.name, "grida");
  assert(/^[A-Za-z0-9._-]+\.tgz$/.test(record.archive));
  const archive = path.join(out, "archives", record.archive);
  const integrity =
    "sha512-" +
    createHash("sha512")
      .update(await readFile(archive))
      .digest("base64");
  let existing;
  let absent = false;
  try {
    existing = JSON.parse(
      (
        await invoke([
          "view",
          `${record.name}@${record.version}`,
          "dist.integrity",
          "--json",
          "--registry",
          "https://registry.npmjs.org",
        ])
      ).stdout
    );
  } catch (error) {
    let code;
    try {
      code = JSON.parse(error.stdout).error?.code;
    } catch {}
    if (code === "E404") absent = true;
    else throw error;
  }
  if (!absent) {
    assert.equal(
      typeof existing,
      "string",
      `Missing registry integrity for ${record.name}@${record.version}`
    );
    assert.equal(
      existing,
      integrity,
      `Existing immutable ${record.name}@${record.version} differs from this candidate`
    );
    // An identical retry must not undo an operator's recovery tag change.
    const tagged = JSON.parse(
      (
        await invoke([
          "view",
          record.name,
          `dist-tags.${tag}`,
          "--json",
          "--registry",
          "https://registry.npmjs.org",
        ])
      ).stdout || "null"
    );
    assert.equal(
      tagged,
      record.version,
      `Existing ${record.name} has a different ${tag} tag; review registry recovery before resuming`
    );
    log(`Already published identical ${record.name}@${record.version}\n`);
    return;
  }
  // npm's immutable version write rejects an intervening collision. Never retry
  // a failed publish or mutate a dist-tag to repair it implicitly.
  await invoke([
    "publish",
    archive,
    "--access",
    "public",
    "--provenance",
    "--tag",
    tag,
    "--ignore-scripts",
    "--registry",
    "https://registry.npmjs.org",
  ]);
  log(`Published ${record.name}@${record.version}\n`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      version: { type: "string" },
      tag: { type: "string" },
      "check-only": { type: "boolean" },
      "dry-run": { type: "boolean" },
    },
  });
  const manifest = JSON.parse(
    await readFile(path.join(root, "packages/grida-cli/package.json"), "utf8")
  );
  releaseGuard(manifest, values.version, values.tag);
  if (values["check-only"]) {
    assert(!values.out);
    process.stdout.write("Native release manifest accepted.\n");
    return;
  }
  assert(values.out && path.isAbsolute(values.out));
  const report = await verifyNative(values.out);
  await verifyInstalledMatrix(values.out, report);
  const record = report.package;
  if (values["dry-run"]) {
    process.stdout.write(
      JSON.stringify(
        {
          name: record.name,
          version: record.version,
          archive: record.archive,
          sha256: record.sha256,
          tag: values.tag,
        },
        null,
        2
      ) + "\n"
    );
    return;
  }
  assert.equal(process.env.GITHUB_REPOSITORY, "gridaco/grida");
  assert.equal(process.env.GITHUB_REF, "refs/heads/main");
  assert.equal(process.env.CLI_NPM_RELEASE_ENABLED, "true");
  assert(
    !process.env.NPM_TOKEN && !process.env.NODE_AUTH_TOKEN,
    "Native releases use npm OIDC without persistent token fallback"
  );
  assert(
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL &&
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    "Trusted publishing requires GitHub OIDC"
  );
  const scratch = await mkdtemp(path.join(tmpdir(), "grida-native-publish-"));
  try {
    await writeFile(path.join(scratch, "npmrc"), "");
    await writeFile(path.join(scratch, "global-npmrc"), "");
    const env = {
      ...process.env,
      npm_config_userconfig: path.join(scratch, "npmrc"),
      npm_config_globalconfig: path.join(scratch, "global-npmrc"),
      npm_config_cache: path.join(scratch, "cache"),
      npm_config_registry: "https://registry.npmjs.org",
      npm_config_update_notifier: "false",
    };
    const npm = await npmProgram();
    const invoke = (args) =>
      exec(process.execPath, [npm, ...args], {
        cwd: scratch,
        env,
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      });
    const npmVersion = (await invoke(["--version"])).stdout
      .trim()
      .split(".")
      .map(Number);
    assert(
      npmVersion[0] > 11 ||
        (npmVersion[0] === 11 &&
          (npmVersion[1] > 5 || (npmVersion[1] === 5 && npmVersion[2] >= 1))),
      "npm 11.5.1+ is required for trusted publishing"
    );
    await publishVerifiedArchive(record, {
      out: values.out,
      tag: values.tag,
      invoke,
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof assert.AssertionError ? error.message : "Native publication failed; inspect the CI step without exposing credentials."}\n`
    );
    process.exitCode = 1;
  });
