const test = require("node:test");
const assert = require("node:assert/strict");
const { rewrite_links } = require("./links");

// DS-7 (docs/wg/platform/docs-sources.md): a source repo with docs/guide
// published at fx/ and docs/wg at wg/fx/
const files = new Set([
  "docs/guide/01-start.md",
  "docs/guide/02-run.md",
  "docs/guide/img/shot.png",
  "docs/wg/overview.md",
  "spec/yaml.md",
  "examples/hello/workflow.yaml",
]);
const published = { "docs/guide": "fx", "docs/wg": "wg/fx" };
const blob = "https://github.com/gridaco/fx/blob/v1.0.0";

function resolve(p) {
  if (files.has(p)) {
    for (const [from, to] of Object.entries(published)) {
      if (p.startsWith(from + "/")) {
        return { kind: "site", site: to + p.slice(from.length) };
      }
    }
    return { kind: "repo", url: `${blob}/${p}` };
  }
  if ([...files].some((f) => f.startsWith(p + "/"))) {
    return {
      kind: "repo",
      url: `https://github.com/gridaco/fx/tree/v1.0.0/${p}`,
    };
  }
  return null;
}

const run = (text) =>
  rewrite_links(text, {
    file: "docs/guide/01-start.md",
    site: "fx/01-start.md",
    resolve,
  });

test("links between published pages stay relative", () => {
  assert.equal(run("[run](02-run.md#keys)").text, "[run](02-run.md#keys)");
  assert.equal(
    run("[overview](../wg/overview.md)").text,
    "[overview](../wg/fx/overview.md)"
  );
  assert.equal(run("![shot](./img/shot.png)").text, "![shot](img/shot.png)");
});

test("links to unpublished files become permalinks", () => {
  assert.equal(
    run("[yaml](../../spec/yaml.md#3-x)").text,
    `[yaml](${blob}/spec/yaml.md#3-x)`
  );
  assert.equal(
    run("[examples](../../examples/)").text,
    "[examples](https://github.com/gridaco/fx/tree/v1.0.0/examples)"
  );
  assert.equal(
    run("[spec]: /spec/yaml.md").text,
    `[spec]: ${blob}/spec/yaml.md`
  );
});

test("link text may wrap lines; titles survive", () => {
  assert.equal(
    run('[the\nspec](../../spec/yaml.md "YAML")').text,
    `[the\nspec](${blob}/spec/yaml.md "YAML")`
  );
});

test("raw HTML may not reference a published file", () => {
  const r = run(
    '<img src="./img/shot.png"> <a href="../../spec/yaml.md">s</a>'
  );
  assert.equal(
    r.text,
    `<img src="./img/shot.png"> <a href="${blob}/spec/yaml.md">s</a>`
  );
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0].reason, /markdown syntax/);
});

test("code, external links and anchors are left alone", () => {
  const text = [
    "```md",
    "[a](../../nope.md)",
    "```",
    "`[b](../../nope.md)`",
    "[c](https://grida.co/docs) [d](#here) [e](mailto:x@y.z)",
  ].join("\n");
  const r = run(text);
  assert.equal(r.text, text);
  assert.deepEqual(r.problems, []);
});

test("missing targets and escapes are problems, not rewrites", () => {
  const r = run("[gone](../../nope.md) [up](../../../outside.md)");
  assert.equal(r.text, "[gone](../../nope.md) [up](../../../outside.md)");
  assert.deepEqual(
    r.problems.map((p) => p.reason),
    ["no such file", "leaves the repository"]
  );
});
