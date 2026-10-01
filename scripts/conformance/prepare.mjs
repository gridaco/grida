import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  repository,
  buildRecord,
  verifyBaseline,
  bundleFingerprint,
  baselinePath,
  referenceRoot,
} from "./baseline.mjs";

const pin = JSON.parse(await readFile(baselinePath, "utf8"));
// Build an immutable source revision: working-tree catalogue changes cannot
// silently become the oracle. Extraction includes the exact dependency closure.
try {
  await verifyBaseline();
} catch {
  await rm(referenceRoot, { recursive: true, force: true });
  await mkdir(referenceRoot, { recursive: true });
  const archive = execFileSync(
    "git",
    ["archive", pin.revision, "--", ...pin.paths],
    { cwd: repository, maxBuffer: 64 * 1024 * 1024 }
  );
  execFileSync("tar", ["-xf", "-", "-C", referenceRoot], { input: archive });
}
const baseline = await verifyBaseline();
for (const [command, args, cwd] of [
  ["pnpm", ["install", "--frozen-lockfile", "--ignore-scripts"], referenceRoot],
  [
    "pnpm",
    ["exec", "turbo", "run", "build", "--filter=grida...", "--force"],
    referenceRoot,
  ],
  [
    "cargo",
    ["build", "--locked", "--workspace", "--features", "conformance"],
    repository,
  ],
]) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// A source edit during the build must not certify a different reference.
await verifyBaseline();
await mkdir(path.dirname(buildRecord), { recursive: true });
await writeFile(
  buildRecord,
  JSON.stringify({
    revision: baseline.revision,
    source_sha256: baseline.sha256,
    bundle_sha256: await bundleFingerprint(),
  }) + "\n"
);
