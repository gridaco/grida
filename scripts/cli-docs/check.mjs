// GRIDA-SEC-013 / GRIDA-SEC-014 — documentation examples are parsed, never dispatched with authority.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Cli } from "../../packages/grida-cli/src/cli.ts";
import { MediaInput } from "../../packages/grida-cli/src/media-input.ts";
import { CliRelease } from "../cli-release/prepare.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
// Resolve the SDK's public package export in its actual consumer's dependency scope.
const { MediaOperations } = createRequire(
  new URL("../../packages/grida-cli/package.json", import.meta.url)
)("@grida/ai");
const execute = promisify(execFile);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const route = (value) => value.replace(/\/$/, "");

export const CliDocs = {
  /** Check the emitted article links, not a sidebar that can mask a stale index link. */
  landingLinks(html, page) {
    const article = /<article\b[^>]*>([\s\S]*?)<\/article>/.exec(html)?.[1];
    assert(article, `Missing documentation article: ${page}`);
    const links = [
      ...article.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>CLI<\/a>/g),
    ];
    assert(links.length, `Missing CLI guide link: ${page}`);
    for (const [, href] of links) {
      const target = new URL(href, `https://grida.co${page}`);
      assert.equal(
        target.origin,
        "https://grida.co",
        `Wrong CLI guide origin: ${page}`
      );
      assert.equal(
        route(target.pathname),
        "/docs/cli",
        `Wrong CLI guide route: ${page} → ${href}`
      );
    }
    return links.length;
  },

  /** A deliberately small literal-command grammar. This never evaluates a shell. */
  words(text) {
    const words = [];
    let word = "",
      quote = "",
      started = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote === "'") {
        if (c === "'") quote = "";
        else word += c;
        continue;
      }
      if (c === "\\") {
        assert(i + 1 < text.length, "Unfinished example escape");
        const next = text[++i];
        assert(
          !quote || ['"', "\\", "$", "`"].includes(next),
          "Unsupported quoted escape"
        );
        word += next;
        started = true;
      } else if (c === "$" || c === "`") {
        throw new Error(
          "Documentation examples must use literal arguments, not shell expansion"
        );
      } else if (quote === '"') {
        if (c === '"') quote = "";
        else word += c;
      } else if (c === "'" || c === '"') {
        quote = c;
        started = true;
      } else if (/\s/.test(c)) {
        if (started) words.push(word);
        word = "";
        started = false;
      } else {
        assert(
          !";|&<>()".includes(c),
          "Shell operators are not documentation invocations"
        );
        word += c;
        started = true;
      }
    }
    assert(!quote, "Unclosed example quote");
    if (started) words.push(word);
    assert.equal(
      words[0],
      "grida",
      "Every checked shell example must invoke grida"
    );
    return words.slice(1);
  },

  examples(markdown) {
    const examples = [],
      files = [];
    const blocks = [...markdown.matchAll(/^```([^\n]*)\n([\s\S]*?)^```\s*$/gm)];
    for (const [, info, body] of blocks) {
      if (info === "sh grida-setup") {
        assert.equal(
          body.trim(),
          "pnpm --filter grida... build\nnode packages/grida-cli/dist/bin.mjs --help",
          "Only the documented preview build is exempt from command parsing"
        );
      } else if (info === "sh") {
        for (const line of body.replace(/\\\r?\n/g, "").split(/\r?\n/)) {
          if (line.trim() && !line.trim().startsWith("#"))
            examples.push(this.words(line));
        }
      } else if (/^(?:sh|bash|shell)\b/.test(info)) {
        throw new Error("Use an ordinary sh fence so CLI examples are checked");
      } else {
        const match = /^(?:text|json) title="([a-z][a-z0-9.-]*)"$/.exec(info);
        if (match) files.push({ name: match[1], body });
      }
    }
    return { examples, files };
  },

  async run({ archive } = {}) {
    const owned = await realpath(
      await mkdtemp(path.join(tmpdir(), "grida-cli-docs-"))
    );
    const originalCwd = process.cwd();
    const report = {
      passed: false,
      topics: 0,
      examples: 0,
      generation_inputs: 0,
      links: 0,
      archive_sha256: "",
    };
    try {
      const docsRoot = path.join(repository, "docs");
      const metadataRoot = path.join(
        repository,
        "apps/docs/.docusaurus/docusaurus-plugin-content-docs/default"
      );
      const metadata = new Map(),
        urls = new Map();
      for (const entry of await readdir(metadataRoot)) {
        if (!entry.endsWith(".json")) continue;
        const data = JSON.parse(
          await readFile(path.join(metadataRoot, entry), "utf8")
        );
        if (!data.source?.startsWith("@site/docs/")) continue;
        const source = data.source.slice("@site/docs/".length);
        const url = route("/docs" + data.slug);
        if (source.startsWith("cli/")) {
          assert(!urls.has(url), `Duplicate CLI route: ${url}`);
          urls.set(url, source);
        }
        metadata.set(source, { ...data, url });
      }
      const htmlFor = async (url) => {
        assert(url.startsWith("/docs/"), "Target must belong to docs");
        const relative = route(url).slice("/docs/".length);
        assert(!relative.split("/").includes(".."), "Invalid docs route");
        const root = path.join(repository, "apps/docs/build", relative);
        for (const file of [path.join(root, "index.html"), root + ".html"]) {
          try {
            return await readFile(file, "utf8");
          } catch (error) {
            if (error.code !== "ENOENT" && error.code !== "ENOTDIR")
              throw error;
          }
        }
        throw new Error(`Missing built documentation page: ${url}`);
      };
      const active = new Set();
      const sources = [];
      for (const name of await readdir(path.join(docsRoot, "cli"))) {
        if (!name.endsWith(".md")) continue;
        const source = `cli/${name}`;
        const meta = metadata.get(source);
        assert(meta, `No Docusaurus metadata for ${source}; rebuild docs`);
        const text = await readFile(path.join(docsRoot, source), "utf8");
        assert.equal(
          text,
          await readFile(
            path.join(repository, "apps/docs/docs", source),
            "utf8"
          ),
          `Stale docs build input: ${source}`
        );
        if (meta.unlisted) {
          assert.equal(
            name,
            "flutter-daemon.md",
            "Only the legacy retirement notice may be unlisted"
          );
          assert(
            text.includes("retired") || text.includes("former"),
            "Legacy notice must explain retirement"
          );
          await htmlFor(meta.url);
          continue;
        }
        assert(!meta.draft, `CLI guide cannot be draft: ${source}`);
        assert(
          meta.description && meta.description.length <= 160,
          `Missing or excessive description: ${source}`
        );
        const html = await htmlFor(meta.url);
        const canonical = /<link[^>]*rel="canonical"[^>]*href="([^"]+)"/.exec(
          html
        )?.[1];
        assert.equal(
          canonical && route(new URL(canonical).pathname),
          meta.url,
          `Wrong canonical route: ${source}`
        );
        active.add(meta.url);
        sources.push({ source, text, meta, html });
      }
      assert.equal(active.size, 6, "The public CLI guide has six owning pages");

      // Root and translated entry pages link to the one canonical English guide.
      // Check actual emitted hrefs: localized Markdown can leave a literal .md URL
      // even while Docusaurus successfully emits a fallback guide and sidebar.
      const translations = await readdir(path.join(docsRoot, "translations"), {
        withFileTypes: true,
      });
      const landingPages = ["/docs/"];
      for (const entry of translations) {
        if (!entry.isDirectory()) continue;
        try {
          await stat(
            path.join(docsRoot, "translations", entry.name, "index.md")
          );
          landingPages.push(`/docs/${entry.name}/`);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      for (const page of landingPages)
        report.links += CliDocs.landingLinks(await htmlFor(page), page);

      for (const { source, text } of sources) {
        for (const [, target] of text.matchAll(/\]\(([^\s)]+)\)/g)) {
          if (target.startsWith("https://github.com/gridaco/grida/")) {
            const pathname = new URL(target).pathname;
            const match = /^\/gridaco\/grida\/(?:blob|tree)\/main\/(.+)$/.exec(
              pathname
            );
            assert(match, `Use canonical repository links: ${target}`);
            await stat(path.join(repository, decodeURIComponent(match[1])));
            report.links++;
          } else if (!/^[a-z]+:/i.test(target)) {
            const [filename, fragment] = target.split("#");
            const resolved = filename
              ? path.posix.normalize(
                  path.posix.join(path.posix.dirname(source), filename)
                )
              : source;
            assert(!resolved.startsWith("../"), `Link outside docs: ${target}`);
            const meta = metadata.get(resolved);
            assert(
              meta && !meta.draft && !meta.unlisted,
              `Missing/unpublished docs target: ${source} → ${target}`
            );
            const html = await htmlFor(meta.url);
            if (fragment)
              assert(
                html.includes(`id="${decodeURIComponent(fragment)}"`),
                `Missing anchor: ${source} → ${target}`
              );
            report.links++;
          }
        }
      }

      const runtime = path.join(owned, "runtime"),
        home = path.join(owned, "home");
      await mkdir(runtime);
      await mkdir(home);
      const env = {
        PATH: path.dirname(process.execPath),
        HOME: home,
        GRIDA_HOME: path.join(home, ".grida"),
        TMPDIR: owned,
        npm_config_cache: path.join(owned, "npm-cache"),
        npm_config_userconfig: path.join(owned, "npmrc"),
        npm_config_globalconfig: path.join(owned, "global-npmrc"),
        npm_config_update_notifier: "false",
      };
      await writeFile(env.npm_config_userconfig, "");
      await writeFile(env.npm_config_globalconfig, "");
      if (!archive) {
        const destination = path.join(owned, "candidate");
        const candidate = await CliRelease.prepare(destination);
        archive = path.join(destination, candidate.archive);
      }
      const bytes = await readFile(path.resolve(archive));
      report.archive_sha256 = digest(bytes);
      const copiedArchive = path.join(owned, "candidate.tgz");
      await writeFile(copiedArchive, bytes);
      const npm = await CliRelease.npm();
      await execute(
        process.execPath,
        [
          npm,
          "install",
          "--prefix",
          runtime,
          copiedArchive,
          "--offline",
          "--ignore-scripts",
          "--omit=optional",
          "--no-audit",
          "--no-fund",
          "--package-lock=false",
        ],
        { env, cwd: owned, timeout: 60_000, maxBuffer: 512 * 1024 }
      );
      const bin = path.join(runtime, "node_modules/grida/dist/bin.mjs");
      const guard = path.join(owned, "network.cjs"),
        guardReport = path.join(owned, "network.json");
      await cp(path.join(repository, "scripts/cli-local/network.cjs"), guard);
      const invoke = async (args) => {
        const result = await execute(
          process.execPath,
          ["--require", guard, bin, ...args],
          {
            cwd: runtime,
            timeout: 15_000,
            maxBuffer: 1024 * 1024,
            env: {
              ...env,
              GRIDA_CLI_PROOF_ROOT: owned,
              GRIDA_CLI_PROOF_REPORT: guardReport,
              GRIDA_CLI_PROOF_OFFLINE: "1",
            },
          }
        );
        assert.deepEqual(JSON.parse(await readFile(guardReport, "utf8")), {
          denied: 0,
          requests: [],
        });
        assert.equal(
          result.stderr,
          "",
          `Unexpected diagnostic: ${args.join(" ")}`
        );
        return result.stdout;
      };
      const covered = new Set();
      for (const topic of Cli.topics) {
        const expected = Cli.docsUrl(topic);
        const url = new URL(expected);
        assert.equal(url.origin, "https://grida.co");
        assert(
          active.has(route(url.pathname)),
          `No active page for ${topic}: ${expected}`
        );
        covered.add(route(url.pathname));
        const words = topic ? topic.split(" ") : [];
        assert.equal((await invoke(["docs", ...words])).trim(), expected);
        assert.equal(await invoke([...words, "--help"]), Cli.helpText(topic));
        report.topics++;
      }
      assert.deepEqual(
        covered,
        active,
        "Every public CLI page needs a command owner"
      );

      const operations = new MediaOperations();
      const asset = await readFile(
        path.join(repository, "fixtures/images/checker.png")
      );
      for (const { source, text } of sources) {
        const directory = path.join(
          owned,
          "examples",
          path.basename(source, ".md")
        );
        await mkdir(path.join(directory, "image"), { recursive: true });
        await writeFile(path.join(directory, "reference.png"), asset);
        // Synthetic previous-step output: file lowering is real; no generation is dispatched.
        await writeFile(path.join(directory, "image/output-1.png"), asset);
        const { examples, files } = this.examples(text);
        for (const file of files)
          await writeFile(path.join(directory, file.name), file.body);
        process.chdir(directory);
        for (const args of examples) {
          let invocation;
          try {
            invocation = Cli.parse(args);
          } catch {
            throw new Error(
              `Invalid guide command in ${source}: grida ${args.join(" ")}`
            );
          }
          report.examples++;
          if (
            invocation.command === "generate" ||
            invocation.command === "models inspect"
          ) {
            const descriptor = MediaInput.inspect(operations, invocation);
            const args = [
              "models",
              "inspect",
              "--provider",
              descriptor.provider_id,
              "--model",
              descriptor.model_id,
              "--kind",
              descriptor.kind,
              "--variant",
              descriptor.variant,
              "--json",
            ];
            assert.deepEqual(
              JSON.parse(await invoke(args)),
              descriptor,
              "Candidate schema differs from the checked guide contract"
            );
            if (invocation.command === "generate") {
              const value = await MediaInput.read(
                descriptor,
                invocation,
                new AbortController().signal,
                Readable.from([])
              );
              operations.parseInput(
                {
                  kind: descriptor.kind,
                  provider: descriptor.provider_id,
                  model_id: descriptor.model_id,
                  variant: descriptor.variant,
                },
                value
              );
              report.generation_inputs++;
            }
          }
        }
      }
      assert(
        report.examples > 0 && report.generation_inputs > 0,
        "Guides must contain checked workflows"
      );
      report.passed = true;
      return report;
    } finally {
      process.chdir(originalCwd);
      await rm(owned, { recursive: true, force: true });
    }
  },
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  assert(
    args.length === 0 || (args.length === 2 && args[0] === "--archive"),
    "Usage: node --import tsx scripts/cli-docs/check.mjs [--archive /absolute/candidate.tgz]"
  );
  const report = await CliDocs.run({ archive: args[1] });
  console.log(JSON.stringify(report, null, 2));
}
