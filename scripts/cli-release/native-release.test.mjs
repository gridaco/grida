import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { selectReleaseEvent } from "./native-publish.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const sourceManifest = JSON.parse(
  await readFile(path.join(root, "packages/grida-cli/package.json"), "utf8")
);

async function history(t, versions) {
  const directory = await mkdtemp(path.join(tmpdir(), "grida-release-event-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const git = async (...args) =>
    (
      await exec("git", args, {
        cwd: directory,
        timeout: 10_000,
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: path.join(directory, "absent-gitconfig"),
        },
      })
    ).stdout.trim();
  await git("init", "--quiet");
  await mkdir(path.join(directory, "packages/grida-cli"), { recursive: true });
  const revisions = [];
  for (const [index, version] of versions.entries()) {
    await writeFile(
      path.join(directory, "packages/grida-cli/package.json"),
      JSON.stringify({
        ...sourceManifest,
        version,
        description: `Commit ${index}`,
      }) + "\n"
    );
    await git("add", "packages/grida-cli/package.json");
    await git(
      "-c",
      "user.name=Release fixture",
      "-c",
      "user.email=release@example.test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      `Commit ${index}`
    );
    revisions.push(await git("rev-parse", "HEAD"));
  }
  const sha = revisions.at(-1);
  return {
    directory,
    eventName: "push",
    repository: "gridaco/grida",
    ref: "refs/heads/main",
    sha,
    event: {
      repository: { full_name: "gridaco/grida" },
      ref: "refs/heads/main",
      before: revisions[0],
      after: sha,
    },
    revisions,
  };
}

test("a multi-commit push compares the previous main revision, not HEAD^", async (t) => {
  const fixture = await history(t, ["0.2.0", "0.3.0", "0.3.0"]);
  assert.deepEqual(await selectReleaseEvent(fixture), {
    publish: true,
    version: "0.3.0",
    tag: "latest",
  });
  assert.deepEqual(
    await selectReleaseEvent({
      ...fixture,
      event: { ...fixture.event, before: fixture.revisions[1] },
    }),
    { publish: false, version: "0.3.0", tag: "latest" }
  );
});

test("a manifest-only edit with the same version skips publication", async (t) => {
  const fixture = await history(t, ["0.3.0", "0.3.0"]);
  assert.deepEqual(await selectReleaseEvent(fixture), {
    publish: false,
    version: "0.3.0",
    tag: "latest",
  });
});

test("prerelease version bumps select next", async (t) => {
  const fixture = await history(t, ["0.3.0", "0.4.0-rc.1"]);
  assert.deepEqual(await selectReleaseEvent(fixture), {
    publish: true,
    version: "0.4.0-rc.1",
    tag: "next",
  });
});

test("selection rejects untrusted authority, mismatched targets and missing history", async (t) => {
  const fixture = await history(t, ["0.2.0", "0.3.0"]);
  for (const override of [
    { repository: "someone/grida" },
    { ref: "refs/heads/feature" },
    { sha: undefined },
    { sha: "0".repeat(40) },
    { eventName: "pull_request" },
    { event: { ...fixture.event, repository: { full_name: "someone/grida" } } },
    { event: { ...fixture.event, ref: "refs/heads/feature" } },
    { event: { ...fixture.event, after: fixture.revisions[0] } },
    { event: { ...fixture.event, before: undefined } },
    { event: { ...fixture.event, before: "0".repeat(40) } },
    { event: { ...fixture.event, before: "HEAD^" } },
    { event: { ...fixture.event, before: "f".repeat(40) } },
  ]) {
    await assert.rejects(selectReleaseEvent({ ...fixture, ...override }));
  }
});

test("manual releases require the exact reviewed version and tag policy", async (t) => {
  const fixture = await history(t, ["0.3.0-rc.3"]);
  const manual = {
    ...fixture,
    eventName: "workflow_dispatch",
    event: {
      repository: fixture.event.repository,
      inputs: { version: "0.3.0-rc.3", tag: "next" },
    },
  };
  assert.deepEqual(await selectReleaseEvent(manual), {
    publish: true,
    version: "0.3.0-rc.3",
    tag: "next",
  });
  for (const inputs of [
    undefined,
    { version: "0.3.0", tag: "latest" },
    { version: "0.3.0-rc.3", tag: "latest" },
    { version: "0.3.0-rc.3", tag: "arbitrary" },
  ]) {
    await assert.rejects(
      selectReleaseEvent({ ...manual, event: { ...manual.event, inputs } })
    );
  }
});

test("the event command writes workflow outputs without publishing", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "grida-release-output-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const eventPath = path.join(directory, "event.json");
  const outputPath = path.join(directory, "output");
  const tag = sourceManifest.version.includes("-") ? "next" : "latest";
  await writeFile(
    eventPath,
    JSON.stringify({
      repository: { full_name: "gridaco/grida" },
      inputs: { version: sourceManifest.version, tag },
    })
  );
  const { stdout } = await exec(
    process.execPath,
    [
      path.join(root, "scripts/cli-release/native-publish.mjs"),
      "--github-event",
    ],
    {
      cwd: directory,
      timeout: 10_000,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: "gridaco/grida",
        GITHUB_REF: "refs/heads/main",
        GITHUB_SHA: "1".repeat(40),
      },
    }
  );
  assert.equal(
    await readFile(outputPath, "utf8"),
    `publish=true\nversion=${sourceManifest.version}\ntag=${tag}\n`
  );
  assert.match(stdout, /Selected grida@/);
});

test("event selection cannot be mixed with publisher arguments", async () => {
  for (const extra of [
    ["--version", "0.3.0"],
    ["--tag", "latest"],
    ["--out", "/tmp/candidate"],
    ["--check-only"],
    ["--dry-run"],
  ]) {
    await assert.rejects(
      exec(
        process.execPath,
        [
          path.join(root, "scripts/cli-release/native-publish.mjs"),
          "--github-event",
          ...extra,
        ],
        { timeout: 10_000 }
      ),
      (error) => {
        assert.match(
          error.stderr,
          /cannot be mixed with publication arguments/
        );
        return true;
      }
    );
  }
});
