const assert = require("node:assert/strict");
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { clearGeneratedDocsTranslations } = require("./copy-translations");

test("retiring a source translation removes generated current docs while retaining owned locale content", () => {
  const root = mkdtempSync(path.join(tmpdir(), "grida-docs-locales-"));
  const files = [
    "i18n/ko/docusaurus-plugin-content-docs/current/cli/index.md",
    "i18n/ko/docusaurus-plugin-content-docs/version-1/intro.md",
    "i18n/ko/docusaurus-theme-classic/navbar.json",
    "i18n/ko/docusaurus-plugin-content-blog/options.json",
    "i18n/ko/code.json",
  ];
  try {
    for (const file of files) {
      const target = path.join(root, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, "synthetic locale content");
    }
    clearGeneratedDocsTranslations(root);
    assert.equal(existsSync(path.join(root, files[0])), false);
    for (const file of files.slice(1))
      assert.equal(existsSync(path.join(root, file)), true);
    clearGeneratedDocsTranslations(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
