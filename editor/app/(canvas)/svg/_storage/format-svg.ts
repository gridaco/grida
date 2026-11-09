/**
 * Tiny, dependency-free SVG/XML pretty-printer.
 *
 * The agent reads the document through this — one element per line, indented
 * by depth — so the model's `edit_file` matches are stable and self-contained.
 * Mixed content (text inside `<text>`/`<tspan>`) stays inline.
 *
 * The output is **not** round-trip-canonical. It's optimized for grep-style
 * substring matching by an LLM, not for byte-for-byte byte preservation:
 * runs of whitespace between tags collapse, attribute order is preserved
 * but spacing inside tags is left untouched.
 *
 * We do NOT use this when writing back to the editor — `editor.load()`
 * accepts any valid SVG, formatting included.
 */

const INDENT = "  ";

// SVG elements where inter-tag whitespace is semantic (it renders as a
// glyph). Collapsing whitespace inside these silently corrupts user
// content — e.g. `<tspan>A</tspan> <tspan>B</tspan>` would become `AB`.
const TEXT_CONTENT_ELEMENTS = new Set([
  "text",
  "tspan",
  "textPath",
  "tref",
  "altGlyph",
]);

type Token =
  | { kind: "open"; text: string; name: string }
  | { kind: "close"; text: string; name: string }
  | { kind: "self"; text: string; name: string }
  | { kind: "meta"; text: string }
  | { kind: "text"; text: string };

function tagName(tag: string): string {
  // Strip leading `</` or `<`, then read until whitespace, `/`, or `>`.
  const start = tag.startsWith("</") ? 2 : 1;
  let end = start;
  while (end < tag.length) {
    const c = tag[end];
    if (c === " " || c === "\t" || c === "\n" || c === "/" || c === ">") break;
    end++;
  }
  return tag.slice(start, end);
}

export function formatSvg(svg: string): string {
  const src = svg.trim();

  // 1) Tokenize into tag/text spans. Preserve all text verbatim — whether
  //    we drop or keep whitespace-only text is decided per-context in the
  //    emit pass below.
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === "<") {
      const end = src.indexOf(">", i);
      if (end === -1) {
        tokens.push({ kind: "text", text: src.slice(i) });
        break;
      }
      const tag = src.slice(i, end + 1);
      if (tag.startsWith("</"))
        tokens.push({ kind: "close", text: tag, name: tagName(tag) });
      else if (tag.endsWith("/>"))
        tokens.push({ kind: "self", text: tag, name: tagName(tag) });
      else if (tag.startsWith("<?") || tag.startsWith("<!"))
        tokens.push({ kind: "meta", text: tag });
      else tokens.push({ kind: "open", text: tag, name: tagName(tag) });
      i = end + 1;
    } else {
      const nextTag = src.indexOf("<", i);
      const text = nextTag === -1 ? src.slice(i) : src.slice(i, nextTag);
      if (text.length > 0) tokens.push({ kind: "text", text });
      i = nextTag === -1 ? src.length : nextTag;
    }
  }

  // 2) Emit with depth tracking. Mixed content (text adjacent to its
  //    surrounding open/close tags) stays on one line. Whitespace-only
  //    text between block-level elements is dropped; whitespace inside a
  //    text-content ancestor (text / tspan / …) is preserved verbatim.
  let out = "";
  let depth = 0;
  let textContentDepth = 0;
  let prevKind: Token["kind"] | null = null;

  for (const tok of tokens) {
    if (tok.kind === "text") {
      if (textContentDepth === 0 && /^\s*$/.test(tok.text)) continue;
      out += tok.text;
      prevKind = "text";
      continue;
    }

    // Closing a text-content element exits its text-content scope, but
    // the `</text>` tag itself is still part of that scope (it must stay
    // on the same line as its content).
    const inTextScope =
      textContentDepth > 0 ||
      (tok.kind === "close" && TEXT_CONTENT_ELEMENTS.has(tok.name));

    if (tok.kind === "close") {
      depth = Math.max(0, depth - 1);
      if (TEXT_CONTENT_ELEMENTS.has(tok.name)) {
        textContentDepth = Math.max(0, textContentDepth - 1);
      }
    }

    if (prevKind === "text" || inTextScope) {
      // Inline — inside a text-content element, every tag is part of one
      // logical line (mixed text/markup is rendered as a single string).
      out += tok.text;
    } else {
      if (out.length > 0) out += "\n";
      out += INDENT.repeat(depth) + tok.text;
    }

    if (tok.kind === "open") {
      depth++;
      if (TEXT_CONTENT_ELEMENTS.has(tok.name)) textContentDepth++;
    }
    prevKind = tok.kind;
  }

  return out;
}
