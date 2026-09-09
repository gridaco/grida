import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import path from "node:path";

/** Resolve this Node installation's companion npm, never an ambient PATH entry. */
export async function npmCli(execPath = process.execPath) {
  // nvm and Homebrew use different lib/libexec layouts; their companion executable
  // resolves to npm-cli.js in either case.
  const filename = await realpath(path.join(path.dirname(execPath), "npm"));
  assert.equal(
    path.basename(filename),
    "npm-cli.js",
    "Expected Node's npm CLI"
  );
  return filename;
}
