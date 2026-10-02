import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const probe = readFileSync(new URL("./split-probe.sh", import.meta.url));

function run(t, text, allow = "") {
  const root = mkdtempSync(path.join(tmpdir(), "grida-split-probe-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, ".github/scripts"), { recursive: true });
  writeFileSync(path.join(root, ".github/scripts/split-probe.sh"), probe);
  writeFileSync(
    path.join(root, ".github/scripts/split-probe-allow.txt"),
    allow
  );
  writeFileSync(path.join(root, "README.md"), text);
  for (const args of [
    ["init", "--quiet"],
    ["add", "."],
  ]) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  return spawnSync("bash", [".github/scripts/split-probe.sh"], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  });
}

test("current application Rust paths and Cargo tooling remain local", (t) => {
  const result = run(
    t,
    [
      "crates/grida-ai/src/lib.rs crates/grida-auth crates/grida-cli/README.md",
      "crates/future-application/Cargo.toml crates/* rust-toolchain.toml",
      "cargo build --workspace --locked; cargo test -p grida-cli",
      "cargo check --package=grida-auth; cargo clippy --workspace",
      "docs/wg/feat-svg-editor/README.md",
    ].join("\n")
  );
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test("departed engine paths and package commands are still rejected", (t) => {
  for (const name of [
    "csscascade",
    "fonts",
    "grida-canvas-wasm",
    "grida",
    "grida_dev",
    "grida_editor",
    "grida_wpt",
    "math2",
  ]) {
    for (const text of [
      `See crates/${name}/src/lib.rs`,
      `cargo test -p ${name}`,
      `cargo build --locked --package=${name}`,
    ]) {
      const result = run(t, text);
      assert.equal(result.status, 1, text);
      assert.match(result.stdout, /\[P1\]/);
    }
  }
  for (const text of [
    "format/grida.fbs",
    "docs/wg/canvas/README.md",
    "bin/activate-flatc",
  ]) {
    assert.equal(run(t, text).status, 1, text);
  }
});

test("explicit engine repository pointers and reasoned exceptions remain valid", (t) => {
  assert.equal(
    run(t, "https://github.com/gridaco/nothing/tree/main/crates/grida").status,
    0
  );
  assert.equal(
    run(t, "crates/grida/src/lib.rs", "README.md\thistorical example\n").status,
    0
  );
});

test("stale exceptions still fail closed", (t) => {
  for (const allow of ["README.md\tstale\n", "missing.md\tmissing\n"]) {
    const result = run(t, "crates/grida-cli/src/lib.rs", allow);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[P4\]/);
  }
});
