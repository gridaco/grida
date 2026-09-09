import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, lstat, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
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
    }
  }
}

main().catch(() => {
  console.error(
    "Workspace publication failed; verify the CLI manifest before retrying."
  );
  process.exitCode = 1;
});
