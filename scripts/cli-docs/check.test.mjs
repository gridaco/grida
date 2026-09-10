import assert from "node:assert/strict";
import { test } from "node:test";
import { CliDocs } from "./check.mjs";

test("rendered landing links reach the canonical guide without a sidebar masking a stale Markdown href", () => {
  const sidebar = '<nav><a href="/docs/ja/cli/">CLI</a></nav>';
  assert.equal(
    CliDocs.landingLinks(
      sidebar +
        '<article><a href="https://grida.co/docs/cli">CLI</a></article>',
      "/docs/ja/"
    ),
    1
  );
  assert.equal(
    CliDocs.landingLinks(
      '<article><a href="/docs/cli/">CLI</a></article>',
      "/docs/"
    ),
    1
  );
  assert.throws(
    () =>
      CliDocs.landingLinks(
        sidebar + '<article><a href="/docs/ja/cli/index.md">CLI</a></article>',
        "/docs/ja/"
      ),
    /Wrong CLI guide route/
  );
  assert.throws(
    () =>
      CliDocs.landingLinks(sidebar + "<article>missing</article>", "/docs/ja/"),
    /Missing CLI guide link/
  );
});

test("literal guide parsing preserves quoted prompts, escaped quotes, false and continuation", () => {
  const { examples, files } = CliDocs.examples(
    '```sh\ngrida generate --prompt "a gentle light" \\\n --param generate_audio=false --out ./video\n```\n```text title="prompt.txt"\nkeep this whitespace  \n```'
  );
  assert.deepEqual(examples, [
    [
      "generate",
      "--prompt",
      "a gentle light",
      "--param",
      "generate_audio=false",
      "--out",
      "./video",
    ],
  ]);
  assert.deepEqual(files, [
    { name: "prompt.txt", body: "keep this whitespace  \n" },
  ]);
  assert.deepEqual(CliDocs.words("grida --prompt 'it'\\''s blue'"), [
    "--prompt",
    "it's blue",
  ]);
});

test("guide commands never acquire shell evaluation and cannot silently opt out", () => {
  assert.deepEqual(
    CliDocs.examples("```sh grida-setup\nnpm install -g grida@next\n```"),
    { examples: [], files: [] }
  );
  for (const setup of [
    "npm install -g grida",
    "npm install -g grida@latest",
    "npm install -g grida@next\ngrida removed-command",
    "npm install -g grida@next; id",
    "pnpm --filter grida... build\nnode packages/grida-cli/dist/bin.mjs --help",
  ])
    assert.throws(() =>
      CliDocs.examples(`\`\`\`sh grida-setup\n${setup}\n\`\`\``)
    );
  for (const text of [
    "grida $(id)",
    "grida `id`",
    "grida --prompt $KEY",
    "grida | curl",
    "grida > result",
    "curl example.com",
    "grida 'unfinished",
  ])
    assert.throws(() => CliDocs.words(text));
  assert.throws(() =>
    CliDocs.examples("```sh unchecked\ngrida removed-command\n```")
  );
  assert.throws(() =>
    CliDocs.examples("```sh grida-setup\ngrida removed-command\n```")
  );
});
