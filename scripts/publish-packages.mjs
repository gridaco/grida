import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const filename = new URL("../packages/grida-cli/package.json", import.meta.url);
const changeset = createRequire(import.meta.url).resolve(
  "@changesets/cli/bin.js"
);

async function main() {
  assert.equal(
    process.argv.length,
    2,
    "Workspace publication takes no arguments"
  );
  assert.equal(process.env.GITHUB_REPOSITORY, "gridaco/grida");
  assert.equal(process.env.GITHUB_REF, "refs/heads/main");
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert(
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL &&
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    "Workspace publication requires GitHub OIDC"
  );
  assert(
    !process.env.NPM_TOKEN &&
      !process.env.NODE_AUTH_TOKEN &&
      !process.env.NPM_ID_TOKEN,
    "Workspace publication uses GitHub OIDC without persistent token fallback"
  );
  const info = await lstat(filename);
  assert(info.isFile(), "Expected a regular CLI package manifest");
  const original = await readFile(filename);
  const manifest = JSON.parse(original.toString("utf8"));
  assert.equal(manifest.name, "grida", "Unexpected CLI package identity");
  assert.equal(
    typeof manifest.private,
    "boolean",
    "CLI private flag must be explicit"
  );
  const changed = !manifest.private;
  const scratch = await mkdtemp(
    path.join(tmpdir(), "grida-workspace-publish-")
  );
  let child;
  let interrupted = false;
  const forward = (signal) => {
    interrupted = true;
    child?.kill(signal);
  };
  const interrupt = () => forward("SIGINT");
  const terminate = () => forward("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    // Ignore machine-level credentials; pnpm exchanges the job's OIDC identity
    // for a short-lived, package-scoped npm token during each publication.
    await writeFile(path.join(scratch, "npmrc"), "");
    await writeFile(path.join(scratch, "global-npmrc"), "");
    // Changesets ignore controls versioning, but publish selects every public
    // package. Hide only the independently published CLI for this child process.
    // If forcibly killed before restoration, private:true remains fail-closed.
    if (changed)
      await writeFile(
        filename,
        JSON.stringify({ ...manifest, private: true }, null, 2) + "\n"
      );
    if (interrupted) {
      process.exitCode = 1;
      return;
    }
    child = spawn(process.execPath, [changeset, "publish"], {
      cwd: repository,
      stdio: "inherit",
      env: {
        ...process.env,
        npm_config_userconfig: path.join(scratch, "npmrc"),
        npm_config_globalconfig: path.join(scratch, "global-npmrc"),
        npm_config_registry: "https://registry.npmjs.org",
      },
    });
    process.exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
  } finally {
    try {
      if (changed) {
        await writeFile(filename, original);
        await chmod(filename, info.mode & 0o7777);
      }
    } finally {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
      await rm(scratch, { recursive: true, force: true });
    }
  }
}

main().catch(() => {
  console.error(
    "Workspace publication failed; verify the CLI manifest before retrying."
  );
  process.exitCode = 1;
});
