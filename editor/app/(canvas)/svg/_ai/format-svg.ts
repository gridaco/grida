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

type Token =
  | { kind: "open"; text: string }
  | { kind: "close"; text: string }
  | { kind: "self"; text: string }
  | { kind: "meta"; text: string }
  | { kind: "text"; text: string };

export function formatSvg(svg: string): string {
  // 1) Collapse whitespace between tags so we get one tag per emit, but
  //    leave text content inside elements alone.
  const compact = svg.replace(/>\s+</g, "><").trim();

  // 2) Tokenize into tag/text spans.
  const tokens: Token[] = [];
  let i = 0;
  while (i < compact.length) {
    if (compact[i] === "<") {
      const end = compact.indexOf(">", i);
      if (end === -1) {
        // Truncated input — emit the tail as text and stop.
        tokens.push({ kind: "text", text: compact.slice(i) });
        break;
      }
      const tag = compact.slice(i, end + 1);
      if (tag.startsWith("</")) tokens.push({ kind: "close", text: tag });
      else if (tag.endsWith("/>")) tokens.push({ kind: "self", text: tag });
      else if (tag.startsWith("<?") || tag.startsWith("<!"))
        tokens.push({ kind: "meta", text: tag });
      else tokens.push({ kind: "open", text: tag });
      i = end + 1;
    } else {
      const nextTag = compact.indexOf("<", i);
      const text =
        nextTag === -1 ? compact.slice(i) : compact.slice(i, nextTag);
      if (text.length > 0) tokens.push({ kind: "text", text });
      i = nextTag === -1 ? compact.length : nextTag;
    }
  }

  // 3) Emit with depth tracking. Mixed content (text adjacent to its
  //    surrounding open/close tags) stays on one line.
  let out = "";
  let depth = 0;
  let prevKind: Token["kind"] | null = null;

  for (const tok of tokens) {
    if (tok.kind === "text") {
      out += tok.text;
      prevKind = "text";
      continue;
    }

    if (tok.kind === "close") {
      depth = Math.max(0, depth - 1);
    }

    if (prevKind === "text") {
      // Inline — no newline / indent.
      out += tok.text;
    } else {
      if (out.length > 0) out += "\n";
      out += INDENT.repeat(depth) + tok.text;
    }

    if (tok.kind === "open") depth++;
    prevKind = tok.kind;
  }

  return out;
}
