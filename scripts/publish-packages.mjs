import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function main() {
  const args = process.argv.slice(2);
  const check = args[0] === "--check";
  if (check) args.shift();
  assert.equal(
    args.length,
    2,
    "Usage: node scripts/publish-packages.mjs [--check] <package-name> <exact-stable-version>"
  );
  const [name, version] = args;
  assert.match(
    name,
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/,
    "Expected an exact npm package name"
  );
  assert.notEqual(
    name,
    "grida",
    "The grida CLI has an independent release workflow"
  );
  assert.match(
    version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    "Expected an exact stable version"
  );
  assert(
    version.split(".").every((part) => Number.isSafeInteger(Number(part))),
    "Invalid stable version"
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

  const repository = await realpath(
    fileURLToPath(new URL("../", import.meta.url))
  );
  const root = JSON.parse(
    await readFile(path.join(repository, "package.json"), "utf8")
  );
  const pinned = /^pnpm@(\d+\.\d+\.\d+)$/.exec(root.packageManager);
  assert(pinned, "The repository must pin an exact pnpm version");
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
    // pnpm uses the GitHub job identity, never machine-level saved credentials.
    await writeFile(path.join(scratch, "npmrc"), "");
    await writeFile(path.join(scratch, "global-npmrc"), "");
    const env = {
      ...process.env,
      npm_config_userconfig: path.join(scratch, "npmrc"),
      npm_config_globalconfig: path.join(scratch, "global-npmrc"),
      npm_config_registry: "https://registry.npmjs.org",
    };
    const run = async (args, cwd = repository, capture = false) => {
      assert(!interrupted, "Publication was cancelled");
      let stdout = "";
      child = spawn("pnpm", args, {
        cwd,
        env,
        stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
      });
      if (capture)
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
      const code = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (status) => resolve(status ?? 1));
      });
      child = undefined;
      assert(!interrupted, "Publication was cancelled");
      assert.equal(code, 0, "pnpm command failed");
      return stdout;
    };
    assert.equal(
      (await run(["--version"], repository, true)).trim(),
      pinned[1],
      "Use the repository's pinned pnpm version"
    );
    const workspaces = JSON.parse(
      await run(
        ["list", "--recursive", "--depth", "-1", "--json"],
        repository,
        true
      )
    );
    assert(Array.isArray(workspaces), "Expected pnpm's workspace inventory");
    const matches = workspaces.filter((workspace) => workspace.name === name);
    assert.equal(matches.length, 1, "Select exactly one workspace package");
    assert.equal(
      typeof matches[0].path,
      "string",
      "Workspace path is required"
    );
    const directory = await realpath(path.resolve(repository, matches[0].path));
    const relative = path.relative(repository, directory);
    assert(
      relative &&
        relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative),
      "The package must be inside the repository"
    );
    const filename = path.join(directory, "package.json");
    assert(
      (await lstat(filename)).isFile(),
      "Expected a regular package manifest"
    );
    const manifest = JSON.parse(await readFile(filename, "utf8"));
    assert.equal(
      manifest.name,
      name,
      "Workspace name does not match its manifest"
    );
    assert.equal(
      manifest.private,
      false,
      "The selected package must be explicitly public"
    );
    assert.equal(
      manifest.version,
      version,
      "The requested version must match the committed package version"
    );
    if (!check)
      await run(
        [
          "publish",
          "--access",
          "public",
          "--tag",
          "latest",
          "--no-git-checks",
          "--no-recursive",
        ],
        directory
      );
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
    await rm(scratch, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Workspace publication failed: ${error.message}`);
  process.exitCode = 1;
});
