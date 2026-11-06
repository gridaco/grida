const assert = require("node:assert/strict");
const test = require("node:test");
const npmReleaseTag = require("./npm-release-tag.cjs");

const context = {
  repo: { owner: "gridaco", repo: "grida" },
  sha: "a".repeat(40),
};
const packageName = "@grida/tailwindcss-colors";
const version = "4.0.2";
const tag = `${packageName}@${version}`;
const ref = `refs/tags/${tag}`;
const options = { context, packageName, version };

function fixture({ existing, readError, createError, raced } = {}) {
  const calls = [];
  let reads = 0;
  const github = {
    rest: {
      git: {
        async getRef(input) {
          calls.push({ method: "getRef", input });
          if (readError) throw readError;
          const data = reads++ === 0 ? existing : raced;
          if (data) return { data };
          throw Object.assign(new Error("Not Found"), { status: 404 });
        },
        async createRef(input) {
          calls.push({ method: "createRef", input });
          if (createError) throw createError;
          return {
            data: {
              ref: input.ref,
              object: { type: "commit", sha: input.sha },
            },
          };
        },
      },
    },
  };
  return { github, calls };
}

test("preflight permits a missing release tag without writing", async () => {
  const { github, calls } = fixture();
  assert.equal(await npmReleaseTag({ ...options, github }), tag);
  assert.deepEqual(calls, [
    { method: "getRef", input: { ...context.repo, ref: `tags/${tag}` } },
  ]);
});

test("preflight rejects every existing tag without writing", async () => {
  for (const type of ["commit", "tag"]) {
    const { github, calls } = fixture({
      existing: { ref, object: { type, sha: context.sha } },
    });
    await assert.rejects(
      npmReleaseTag({ ...options, github }),
      /Release tag already exists/
    );
    assert.deepEqual(
      calls.map((call) => call.method),
      ["getRef"]
    );
  }
});

test("creates only the selected package tag at the dispatched commit", async () => {
  const { github, calls } = fixture();
  assert.equal(await npmReleaseTag({ ...options, github, create: true }), tag);
  assert.deepEqual(calls, [
    { method: "getRef", input: { ...context.repo, ref: `tags/${tag}` } },
    { method: "createRef", input: { ...context.repo, ref, sha: context.sha } },
  ]);
});

test("tag creation retries accept the same lightweight tag without writing", async () => {
  const { github, calls } = fixture({
    existing: { ref, object: { type: "commit", sha: context.sha } },
  });
  assert.equal(await npmReleaseTag({ ...options, github, create: true }), tag);
  assert.deepEqual(
    calls.map((call) => call.method),
    ["getRef"]
  );
});

test("refuses another commit, annotated tags, and mismatched references", async () => {
  const cases = [
    [
      { ref, object: { type: "commit", sha: "b".repeat(40) } },
      /another commit/,
    ],
    [
      { ref, object: { type: "tag", sha: context.sha } },
      /annotated release tag/,
    ],
    [
      { ref: `${ref}-other`, object: { type: "commit", sha: context.sha } },
      /Unexpected release tag/,
    ],
  ];
  for (const [existing, message] of cases) {
    const { github, calls } = fixture({ existing });
    await assert.rejects(
      npmReleaseTag({ ...options, github, create: true }),
      message
    );
    assert.deepEqual(
      calls.map((call) => call.method),
      ["getRef"]
    );
  }
});

test("handles creation races only when the new tag matches exactly", async () => {
  for (const sha of [context.sha, "b".repeat(40)]) {
    const { github, calls } = fixture({
      createError: Object.assign(new Error("Reference already exists"), {
        status: 422,
      }),
      raced: { ref, object: { type: "commit", sha } },
    });
    const operation = npmReleaseTag({ ...options, github, create: true });
    if (sha === context.sha) assert.equal(await operation, tag);
    else await assert.rejects(operation, /another commit/);
    assert.deepEqual(
      calls.map((call) => call.method),
      ["getRef", "createRef", "getRef"]
    );
  }
});

test("propagates API failures without treating them as missing tags", async () => {
  const readError = Object.assign(new Error("Forbidden"), { status: 403 });
  const readFixture = fixture({ readError });
  await assert.rejects(
    npmReleaseTag({ ...options, github: readFixture.github, create: true }),
    (error) => error === readError
  );
  assert.deepEqual(
    readFixture.calls.map((call) => call.method),
    ["getRef"]
  );

  for (const status of [403, 422]) {
    const createError = Object.assign(new Error("Cannot create reference"), {
      status,
    });
    const { github } = fixture({ createError });
    await assert.rejects(
      npmReleaseTag({ ...options, github, create: true }),
      (error) => error === createError
    );
  }
});

test("rejects invalid release identities before any API calls", async () => {
  for (const invalid of [
    { packageName: "grida" },
    { packageName: "../other" },
    { version: "4.0.2/other" },
    { context: { ...context, sha: "main" } },
    { create: "true" },
  ]) {
    const { github, calls } = fixture();
    await assert.rejects(npmReleaseTag({ ...options, ...invalid, github }));
    assert.deepEqual(calls, []);
  }
});
