import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { npmCli } from "./npm.mjs";

test("companion npm resolves both lib and Homebrew libexec layouts", async () => {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-npm-layout-"))
  );
  try {
    for (const directory of [
      "lib/node_modules/npm/bin",
      "libexec/lib/node_modules/npm/bin",
    ]) {
      const installation = path.join(
        root,
        directory.startsWith("libexec") ? "brew" : "nvm"
      );
      const bin = path.join(installation, "bin");
      const expected = path.join(installation, directory, "npm-cli.js");
      await mkdir(bin, { recursive: true });
      await mkdir(path.dirname(expected), { recursive: true });
      await writeFile(expected, "// synthetic companion; never executed\n");
      await symlink(path.relative(bin, expected), path.join(bin, "npm"));
      assert.equal(await npmCli(path.join(bin, "node")), expected);
    }
    await assert.rejects(npmCli(path.join(root, "absent/node")), {
      code: "ENOENT",
    });
    const other = path.join(root, "other");
    await mkdir(other);
    await writeFile(path.join(other, "npm"), "// not npm-cli.js\n");
    await assert.rejects(
      npmCli(path.join(other, "node")),
      /Expected Node's npm CLI/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
