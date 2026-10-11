const path = require("path").posix;
const { rewrite_links } = require("./links");

/**
 * Builds the snapshot of one docs source and applies the source rules
 * (docs/wg/platform/docs-sources.md). DS-4 — a pure function of the
 * declaration and one revision of the source repo, so `check`, `verify` and
 * the site build see the same pages and the same problems.
 */

const PAGE = /\.mdx?$/i;
const CATEGORY = "_category_.json";
const VIDEO = /\.(mp4|m4v|mov|webm|mkv|avi|ogv)$/i;
const INDEX = ["index.md", "index.mdx", "README.md"];

/**
 * @param {object} args
 * @param {object} args.source the declaration (normalized, see index.js)
 * @param {{ assets: { types: string[]; max_bytes: number };
 *   sources: Record<string, object> }} args.manifest every declaration, for
 *   links into other sources of the same repo, and the asset rules
 * @param {{ commit: string; files: Set<string>; read: (p: string) => Buffer }} args.snapshot
 *   the source repo at one revision: every file path, and a reader for the
 *   published directories
 * @param {string | null} args.tag the release tag, when the revision is one
 * @returns {{ files: Map<string, Buffer>;
 *   problems: { file: string; target?: string; reason: string }[] }}
 */
function build({ source, manifest, snapshot, tag }) {
  const permalink_ref = tag ?? snapshot.commit;
  const asset_ext = new RegExp(`\\.(${manifest.assets.types.join("|")})$`, "i");

  // DS-7 — a link may land in any source of the same repo
  const mappings = Object.values(manifest.sources)
    .filter((s) => s.repo === source.repo)
    .flatMap((s) =>
      Object.entries(s.paths).map(([from, { to }]) => ({
        from,
        to,
        exclude: s.exclude,
      }))
    );

  const mapping_of = (repo_path) =>
    mappings.find(
      (m) =>
        repo_path.startsWith(m.from + "/") && !m.exclude.includes(repo_path)
    );

  // DS-5 — only pages, assets and category metadata in a published directory
  const site_path_of = (repo_path) => {
    const m = mapping_of(repo_path);
    if (!m) return null;
    const name = path.basename(repo_path);
    if (!PAGE.test(name) && !asset_ext.test(name) && name !== CATEGORY) {
      return null;
    }
    return path.join(m.to, repo_path.slice(m.from.length + 1));
  };

  const is_dir = (p) => {
    for (const f of snapshot.files) if (f.startsWith(p + "/")) return true;
    return false;
  };

  const permalink = (repo_path, kind) =>
    `https://github.com/${source.repo}/${kind}/${permalink_ref}` +
    (repo_path ? `/${encodeURI(repo_path)}` : "");

  const resolve = (repo_path) => {
    if (snapshot.files.has(repo_path)) {
      const site = site_path_of(repo_path);
      if (site) return { kind: "site", site };
      // DS-10 — the site never serves an asset from the source's host
      if (asset_ext.test(repo_path) || VIDEO.test(repo_path)) {
        return {
          kind: "error",
          reason: "asset outside the published directory",
        };
      }
      return { kind: "repo", url: permalink(repo_path, "blob") };
    }
    if (repo_path === "" || is_dir(repo_path)) {
      for (const name of INDEX) {
        const index = path.join(repo_path, name);
        const site = snapshot.files.has(index) && site_path_of(index);
        if (site) return { kind: "site", site };
      }
      return { kind: "repo", url: permalink(repo_path, "tree") };
    }
    return null;
  };

  const files = new Map();
  const problems = [];
  for (const [from, { to, label }] of Object.entries(source.paths)) {
    for (const file of snapshot.files) {
      if (!file.startsWith(from + "/") || !mapping_of(file)) continue;
      if (VIDEO.test(file)) {
        problems.push({
          file,
          reason: "video is not stored in git; host it and link to it",
        });
        continue;
      }
      const site = site_path_of(file);
      if (!site) continue;
      let bytes = snapshot.read(file);
      if (PAGE.test(file)) {
        const r = rewrite_links(bytes.toString("utf8"), {
          file,
          site,
          resolve,
        });
        problems.push(...r.problems.map((p) => ({ file, ...p })));
        const text = file.endsWith(".md") ? as_commonmark(r.text) : r.text;
        bytes = Buffer.from(text);
      } else if (
        asset_ext.test(file) &&
        bytes.length > manifest.assets.max_bytes
      ) {
        problems.push({
          file,
          reason: `${kib(bytes.length)} exceeds the ${kib(manifest.assets.max_bytes)} asset limit`,
        });
      }
      files.set(site, bytes);
    }
    const category = path.join(to, CATEGORY);
    if (label && !files.has(category)) {
      files.set(
        category,
        Buffer.from(JSON.stringify({ label }, null, 2) + "\n")
      );
    }
  }
  return { files, problems };
}

/**
 * DS-8 — a source writes `.md` for its repo host: CommonMark, not the MDX
 * this site parses `.md` as by default (`<br>` in a table, `{` in prose).
 * Declares it, unless the page already chose. Docusaurus reads the choice
 * from `mdx.format`; a top-level `format` key is ignored.
 */
function as_commonmark(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!fm) return `---\nmdx:\n  format: md\n---\n\n${text}`;
  if (/^mdx:/m.test(fm[1])) return text;
  return text.replace(/^---\r?\n/, "---\nmdx:\n  format: md\n");
}

function kib(n) {
  return `${Math.ceil(n / 1024)} KiB`;
}

module.exports = { build, as_commonmark };
