const path = require("path").posix;

/**
 * DS-7 — rewrites the relative links of one markdown page from a docs source
 * (docs/wg/platform/docs-sources.md).
 *
 * A relative link is resolved in the source repo, then `resolve` decides:
 * - `{ kind: "site", site }` — published; written as a relative site link
 * - `{ kind: "repo", url }` — present but unpublished; written as a permalink
 * - `{ kind: "error", reason }` — a source-rule violation
 * - `null` — no such file
 *
 * Raw HTML is not interpreted by the site, so a relative `href`/`src` may only
 * become a permalink; one that lands on a published file is a violation
 * (use the markdown syntax).
 *
 * Pure: the caller supplies `resolve`, so this never touches git or disk.
 *
 * @param {string} text markdown source
 * @param {object} ctx
 * @param {string} ctx.file repo path of the page
 * @param {string} ctx.site site path of the page
 * @param {(repo_path: string) =>
 *   | { kind: "site"; site: string }
 *   | { kind: "repo"; url: string }
 *   | { kind: "error"; reason: string }
 *   | null} ctx.resolve
 * @returns {{ text: string; problems: { target: string; reason: string }[] }}
 */
function rewrite_links(text, ctx) {
  const problems = [];

  const rewrite = (raw, html) => {
    const target = raw.startsWith("<") ? raw.slice(1, -1) : raw;
    if (!target || is_external(target)) return raw;

    const cut = target.search(/[?#]/);
    const pathname = cut === -1 ? target : target.slice(0, cut);
    const suffix = cut === -1 ? "" : target.slice(cut);
    if (!pathname) return raw;

    const repo_path = to_repo_path(ctx.file, safe_decode(pathname));
    const hit =
      repo_path === null
        ? { kind: "error", reason: "leaves the repository" }
        : ctx.resolve(repo_path);
    if (!hit) {
      problems.push({ target, reason: "no such file" });
      return raw;
    }
    if (hit.kind === "error") {
      problems.push({ target, reason: hit.reason });
      return raw;
    }
    if (hit.kind === "repo") {
      return hit.url + (suffix.startsWith("#") ? suffix : "");
    }
    if (html) {
      problems.push({
        target,
        reason:
          "raw HTML cannot reference a published file; use markdown syntax",
      });
      return raw;
    }
    const rel = path.relative(path.dirname(ctx.site), hit.site);
    return encodeURI(rel) + suffix;
  };

  const out = map_prose(text, (prose) =>
    prose
      // inline links and images: [text](target "title"), ![alt](<target>)
      .replace(
        /(\]\(\s*)(<[^>\n]*>|[^\s)]+)/g,
        (_, open, raw) => open + rewrite(raw, false)
      )
      // reference definitions: [id]: target "title"
      .replace(
        /^( {0,3}\[[^\]\n]+\]:[ \t]*)(<[^>\n]*>|\S+)/gm,
        (_, open, raw) => open + rewrite(raw, false)
      )
      // raw html: <a href="…">, <img src="…">
      .replace(
        /(\s(?:href|src)=)(["'])([^"'\n]*)\2/g,
        (_, open, quote, raw) => open + quote + rewrite(raw, true) + quote
      )
  );

  return { text: out, problems };
}

/** Applies `fn` to prose only: fenced blocks and inline code stay verbatim. */
function map_prose(text, fn) {
  const parts = text.split(
    /(^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\2[^\n]*$|(?![\s\S])))/m
  );
  let out = "";
  // split() with two capture groups yields [prose, fence, marker, prose, …]
  for (let i = 0; i < parts.length; i += 3) {
    out += map_outside_code_spans(parts[i], fn);
    if (i + 1 < parts.length) out += parts[i + 1];
  }
  return out;
}

function map_outside_code_spans(text, fn) {
  const spans = [];
  const masked = text.replace(/`[^`\n]*`/g, (span) => {
    spans.push(span);
    return `${spans.length - 1}`;
  });
  return fn(masked).replace(/(\d+)/g, (_, i) => spans[Number(i)]);
}

function is_external(target) {
  return (
    target.startsWith("#") ||
    target.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  );
}

/** Resolves against the linking page; `/x` is the repo root, as on GitHub. */
function to_repo_path(file, pathname) {
  const joined = pathname.startsWith("/")
    ? path.normalize(pathname.slice(1))
    : path.normalize(path.join(path.dirname(file), pathname));
  const clean = joined.replace(/\/+$/, "");
  if (clean === ".." || clean.startsWith("../")) return null;
  return clean === "." ? "" : clean;
}

function safe_decode(s) {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

module.exports = { rewrite_links };
