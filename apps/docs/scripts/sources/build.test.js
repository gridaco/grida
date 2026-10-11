const test = require("node:test");
const assert = require("node:assert/strict");
const { build, as_commonmark } = require("./build");

// The source rules (docs/wg/platform/docs-sources.md), on an in-memory repo.

const manifest = {
  assets: { types: ["png", "svg"], max_bytes: 1000 },
  sources: {
    guide: {
      repo: "acme/tool",
      ref: "main",
      paths: { "docs/guide": { to: "tool" } },
      exclude: [],
    },
    wg: {
      repo: "acme/tool",
      ref: "main",
      paths: { "docs/wg": { to: "wg/tool", label: "Tool" } },
      exclude: ["docs/wg/draft.md"],
    },
  },
};

function snapshot(tree) {
  return {
    commit: "c0ffee".padEnd(40, "0"),
    files: new Set(Object.keys(tree)),
    read: (p) => Buffer.from(tree[p]),
  };
}

const run = (tree, id = "guide", tag = null) =>
  build({
    source: manifest.sources[id],
    manifest,
    snapshot: snapshot(tree),
    tag,
  });

test("DS-5 publishes pages, assets and category metadata of the published directory only", () => {
  const { files, problems } = run({
    "docs/guide/a.md": "# A",
    "docs/guide/img/a.png": "png",
    "docs/guide/_category_.json": "{}",
    "docs/guide/example.yaml": "x: 1",
    "docs/other/b.md": "# B",
    "src/main.rs": "fn main() {}",
  });
  assert.deepEqual([...files.keys()].sort(), [
    "tool/_category_.json",
    "tool/a.md",
    "tool/img/a.png",
  ]);
  assert.deepEqual(problems, []);
});

test("excluded pages are not published; a label becomes category metadata", () => {
  const { files } = run(
    { "docs/wg/a.md": "# A", "docs/wg/draft.md": "# D" },
    "wg"
  );
  assert.deepEqual([...files.keys()].sort(), [
    "wg/tool/_category_.json",
    "wg/tool/a.md",
  ]);
  assert.deepEqual(JSON.parse(files.get("wg/tool/_category_.json")), {
    label: "Tool",
  });
});

test("DS-7 links reach other sources of the same repo, and permalinks use the tag", () => {
  const { files } = run(
    {
      "docs/guide/a.md": "[o](../wg/a.md) [s](../../src/main.rs)",
      "docs/wg/a.md": "# O",
      "src/main.rs": "",
    },
    "guide",
    "v1.2.3"
  );
  assert.match(
    files.get("tool/a.md").toString(),
    /\[o\]\(\.\.\/wg\/tool\/a\.md\) \[s\]\(https:\/\/github\.com\/acme\/tool\/blob\/v1\.2\.3\/src\/main\.rs\)/
  );
});

test("DS-10 an asset outside the published directory is a problem, never a hotlink", () => {
  const { problems } = run({
    "docs/guide/a.md": "![x](../../assets/x.png)",
    "assets/x.png": "png",
  });
  assert.deepEqual(
    problems.map((p) => p.reason),
    ["asset outside the published directory"]
  );
});

test("assets over the size limit and video files are problems", () => {
  const { problems } = run({
    "docs/guide/big.png": "x".repeat(2000),
    "docs/guide/demo.mp4": "mp4",
  });
  assert.deepEqual(problems.map((p) => p.file).sort(), [
    "docs/guide/big.png",
    "docs/guide/demo.mp4",
  ]);
});

test("DS-8 pages are declared CommonMark unless they chose", () => {
  assert.equal(as_commonmark("# A"), "---\nmdx:\n  format: md\n---\n\n# A");
  assert.equal(
    as_commonmark("---\ntitle: A\n---\n# A"),
    "---\nmdx:\n  format: md\ntitle: A\n---\n# A"
  );
  const chose = "---\nmdx:\n  format: mdx\n---\n# A";
  assert.equal(as_commonmark(chose), chose);
});
