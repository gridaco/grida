// Minimal XML/SVG parser that preserves source trivia for round-trip fidelity.
//
// Design constraint: `load(x) → serialize() === x` for trivial SVGs. To make
// that possible we need to keep more than DOMParser gives us — XML
// declaration, comments, processing instructions, doctype, attribute order,
// whitespace between tags, quote styles, namespace prefixes verbatim.
//
// This is *not* a conforming XML parser. It is good enough to round-trip the
// kind of SVG humans and tooling actually write. Where it fails the test
// suite, the failure should be visible and small.
//
// Known, deliberate fidelity tolerances (each trades spec conformance
// against byte fidelity; see also the `AttrToken.value` doc):
//   - Entity spellings normalize on re-emit (`&#x72;` → the literal char;
//     unknown named entities like `&nbsp;` re-emit as `&amp;nbsp;`).
//   - Bare `&` / `<` inside attribute values are accepted (invalid XML)
//     and re-emit escaped (`&amp;` / `&lt;`).
//   - Line ends are NOT normalized (XML 1.0 §2.11 would fold `\r\n` to
//     `\n`); kept verbatim on purpose for byte-exact round-trip.
//
// Strictness is load-bearing downstream: the SVG editor's rendering-
// hardening design (docs/wg/feat-svg-editor/rendering-hardening.md, R4)
// relies on this parser THROWING on input it cannot tokenize. Loosening
// toward error-recovery is a contract change for that consumer, not a
// local implementation detail.

/**
 * Opaque-by-convention identifier for a node in a parsed SVG tree.
 *
 * Mirrors the editor's notion of `NodeId`; defined here so the parser
 * has no upstream dependency. Consumers re-export it (e.g. the SVG
 * editor's `types.ts`).
 */
export type NodeId = string;

export type AttrToken = {
  /** Verbatim source name including any prefix, e.g. "xlink:href". */
  raw_name: string;
  /** Prefix or null. */
  prefix: string | null;
  /** Local name. */
  local: string;
  /** Resolved namespace URI, or null if unprefixed and no default ns. */
  ns: string | null;
  /** Attribute value, entity-decoded. Known fidelity tolerance: entity
   *  SPELLINGS do not survive — `&#x72;ed` decodes to `red` and re-encodes
   *  canonically. Not always meaning-preserving for conforming consumers:
   *  whitespace references (`&#10;`) re-emit as raw control characters
   *  (which XML attribute-value normalization folds to spaces), and
   *  unrecognized named entities (`&nbsp;`) re-emit ampersand-escaped. */
  value: string;
  /** Trivia before the attribute name (whitespace, usually `" "`). */
  pre: string;
  /** Trivia between the attribute name and `=` (usually empty). */
  eq_trivia: string;
  /** Trivia between `=` and the opening quote (usually empty). */
  eq_trailing: string;
  /** Quote character (`"` or `'`). */
  quote: '"' | "'";
};

export type ElementNode = {
  kind: "element";
  id: NodeId;
  parent: NodeId | null;
  /** Verbatim tag name with prefix. */
  raw_tag: string;
  prefix: string | null;
  local: string;
  ns: string | null;
  attrs: AttrToken[];
  children: NodeId[];
  /** True if the source wrote `<tag/>` (no children). */
  self_closing: boolean;
  /** Trivia inside the tag before `>` or `/>` (e.g. `" "` in `<tag />`). */
  open_tag_trailing: string;
  /** Trivia between `</` and tag name in the close, e.g. usually empty. */
  close_tag_leading: string;
  /** Trivia after the closing tag name before `>`, usually empty. */
  close_tag_trailing: string;
};

export type TextNode = {
  kind: "text";
  id: NodeId;
  parent: NodeId | null;
  /** Verbatim text, entity-decoded. */
  value: string;
};

export type CommentNode = {
  kind: "comment";
  id: NodeId;
  parent: NodeId | null;
  /** Comment body (between `<!--` and `-->`). */
  value: string;
};

export type CDataNode = {
  kind: "cdata";
  id: NodeId;
  parent: NodeId | null;
  value: string;
};

export type PiNode = {
  kind: "pi";
  id: NodeId;
  parent: NodeId | null;
  /** PI target, e.g. "xml" for `<?xml ... ?>`. */
  target: string;
  value: string;
};

export type DoctypeNode = {
  kind: "doctype";
  id: NodeId;
  parent: NodeId | null;
  /** Full doctype declaration body, e.g. `svg PUBLIC "..." "..."`. */
  value: string;
};

export type AnyNode =
  | ElementNode
  | TextNode
  | CommentNode
  | CDataNode
  | PiNode
  | DoctypeNode;

export type ParseResult = {
  /** XML prolog content (PIs, doctype, comments, whitespace) before the root. */
  prolog: AnyNode[];
  /** The root <svg> element. */
  root: NodeId;
  /** Trailing content (whitespace, comments) after the root. */
  epilog: AnyNode[];
  /** All nodes by id (prolog + tree + epilog). */
  nodes: Map<NodeId, AnyNode>;
  /** Default-namespace stack snapshots are not preserved; resolved per element. */
};

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

let id_counter = 0;
function fresh_id(): NodeId {
  return `n${id_counter++}`;
}

export function reset_id_counter(): void {
  id_counter = 0;
}

export function parse_svg(src: string): ParseResult {
  // Boundary type-check: callers from JS lose the `src: string` annotation,
  // and a hot-reload race or stale state can leak `undefined` past it. Without
  // this guard the parser crashes at `src.length` with a stack frame pointing
  // at internal parser code, which reads as a parser defect.
  if (typeof src !== "string") {
    throw new TypeError(
      `parse_svg requires a string source, got ${src === null ? "null" : typeof src}`
    );
  }
  reset_id_counter();
  const nodes = new Map<NodeId, AnyNode>();
  const prolog: AnyNode[] = [];
  const epilog: AnyNode[] = [];

  let i = 0;
  const n = src.length;
  let root: NodeId | null = null;
  const open_stack: ElementNode[] = [];
  /** ns prefix → uri, per ancestor scope (top of stack). */
  const ns_stack: Map<string, string>[] = [
    new Map([
      ["xml", XML_NS],
      ["xmlns", XMLNS_NS],
    ]),
  ];
  /** default ns per ancestor scope (top of stack). */
  const default_ns_stack: (string | null)[] = [null];

  function push_to_parent(node: AnyNode) {
    nodes.set(node.id, node);
    if (open_stack.length === 0) {
      // Pre-root content goes to prolog; post-root content goes to epilog.
      // The root element itself is emitted separately by the serializer, so
      // we never push it to prolog/epilog.
      if (node.kind === "element" && root === null) return;
      if (root === null) prolog.push(node);
      else epilog.push(node);
      return;
    }
    const parent = open_stack[open_stack.length - 1];
    node.parent = parent.id;
    parent.children.push(node.id);
  }

  while (i < n) {
    if (src[i] === "<") {
      // Comment?
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i + 4);
        if (end === -1) throw new Error("unterminated comment");
        const value = src.slice(i + 4, end);
        push_to_parent({
          kind: "comment",
          id: fresh_id(),
          parent: null,
          value,
        });
        i = end + 3;
        continue;
      }
      // CDATA?
      if (src.startsWith("<![CDATA[", i)) {
        const end = src.indexOf("]]>", i + 9);
        if (end === -1) throw new Error("unterminated CDATA");
        const value = src.slice(i + 9, end);
        push_to_parent({ kind: "cdata", id: fresh_id(), parent: null, value });
        i = end + 3;
        continue;
      }
      // Doctype?
      if (src.startsWith("<!DOCTYPE", i) || src.startsWith("<!doctype", i)) {
        let depth = 1;
        let j = i + 9;
        while (j < n && depth > 0) {
          const c = src[j];
          if (c === "<") depth++;
          else if (c === ">") depth--;
          if (depth === 0) break;
          j++;
        }
        if (j >= n) throw new Error("unterminated doctype");
        push_to_parent({
          kind: "doctype",
          id: fresh_id(),
          parent: null,
          value: src.slice(i + 9, j),
        });
        i = j + 1;
        continue;
      }
      // Processing instruction?
      if (src.startsWith("<?", i)) {
        const end = src.indexOf("?>", i + 2);
        if (end === -1) throw new Error("unterminated PI");
        const body = src.slice(i + 2, end);
        const space = body.search(/\s/);
        const target = space === -1 ? body : body.slice(0, space);
        const value = space === -1 ? "" : body.slice(space + 1);
        push_to_parent({
          kind: "pi",
          id: fresh_id(),
          parent: null,
          target,
          value,
        });
        i = end + 2;
        continue;
      }
      // End tag?
      if (src[i + 1] === "/") {
        const end = src.indexOf(">", i + 2);
        if (end === -1) throw new Error("unterminated end tag");
        const body = src.slice(i + 2, end);
        const m = body.match(/^(\s*)([^\s]+)(\s*)$/);
        if (!m) throw new Error("malformed end tag at " + i);
        const closing_raw_tag = m[2];
        const open = open_stack[open_stack.length - 1];
        if (!open) throw new Error("unexpected end tag at " + i);
        if (open.raw_tag !== closing_raw_tag) {
          throw new Error(
            `mismatched end tag: expected </${open.raw_tag}> but found </${closing_raw_tag}>`
          );
        }
        open_stack.pop();
        ns_stack.pop();
        default_ns_stack.pop();
        // Preserve the leading/trailing trivia in the close tag.
        open.close_tag_leading = m[1];
        open.close_tag_trailing = m[3];
        i = end + 1;
        continue;
      }
      // Start tag.
      const start = i + 1;
      let j = start;
      // Read raw tag name.
      while (j < n && !/[\s/>]/.test(src[j])) j++;
      const raw_tag = src.slice(start, j);
      const [prefix, local] = split_qname(raw_tag);
      const { attrs, end_index, self_closing, trailing } = parse_attrs(src, j);

      // Resolve ns: build new scope from parent + this element's xmlns:* / xmlns.
      const new_ns_map = new Map(ns_stack[ns_stack.length - 1]);
      let new_default_ns = default_ns_stack[default_ns_stack.length - 1];
      for (const a of attrs) {
        if (a.prefix === "xmlns") {
          new_ns_map.set(a.local, a.value);
        } else if (a.prefix === null && a.local === "xmlns") {
          new_default_ns = a.value;
        }
      }
      // Attribute ns resolution: prefixed → ns map; unprefixed → no namespace
      // (per XML namespaces 1.0 §6.2 — default ns does NOT apply to attrs).
      for (const a of attrs) {
        if (
          a.prefix === "xmlns" ||
          (a.prefix === null && a.local === "xmlns")
        ) {
          a.ns = XMLNS_NS;
        } else if (a.prefix) {
          a.ns = new_ns_map.get(a.prefix) ?? null;
        } else {
          a.ns = null;
        }
      }
      const element_ns = prefix
        ? (new_ns_map.get(prefix) ?? null)
        : new_default_ns;

      const elem: ElementNode = {
        kind: "element",
        id: fresh_id(),
        parent: null,
        raw_tag,
        prefix,
        local,
        ns: element_ns,
        attrs,
        children: [],
        self_closing,
        open_tag_trailing: trailing,
        close_tag_leading: "",
        close_tag_trailing: "",
      };
      push_to_parent(elem);
      if (root === null) root = elem.id;
      if (!self_closing) {
        open_stack.push(elem);
        ns_stack.push(new_ns_map);
        default_ns_stack.push(new_default_ns);
      }
      i = end_index;
      continue;
    }
    // Text node — everything up to next `<`.
    const next = src.indexOf("<", i);
    const end = next === -1 ? n : next;
    const value = decode_entities(src.slice(i, end));
    push_to_parent({ kind: "text", id: fresh_id(), parent: null, value });
    i = end;
  }

  if (open_stack.length > 0) {
    throw new Error(
      `unclosed element <${open_stack[open_stack.length - 1].raw_tag}>`
    );
  }
  if (root === null) throw new Error("no root element");

  return { prolog, root, epilog, nodes };
}

function split_qname(qname: string): [string | null, string] {
  const idx = qname.indexOf(":");
  if (idx === -1) return [null, qname];
  return [qname.slice(0, idx), qname.slice(idx + 1)];
}

function parse_attrs(
  src: string,
  from: number
): {
  attrs: AttrToken[];
  end_index: number;
  self_closing: boolean;
  trailing: string;
} {
  const attrs: AttrToken[] = [];
  let i = from;
  let pre = "";
  const n = src.length;
  while (i < n) {
    // Read whitespace.
    const ws_start = i;
    while (i < n && /\s/.test(src[i])) i++;
    pre += src.slice(ws_start, i);
    if (i >= n) throw new Error("unterminated start tag");
    const c = src[i];
    if (c === "/") {
      // Self-close.
      if (src[i + 1] !== ">") throw new Error("expected '/>' at " + i);
      return { attrs, end_index: i + 2, self_closing: true, trailing: pre };
    }
    if (c === ">") {
      return { attrs, end_index: i + 1, self_closing: false, trailing: pre };
    }
    // Attribute name.
    const name_start = i;
    while (i < n && !/[\s=/>]/.test(src[i])) i++;
    const raw_name = src.slice(name_start, i);
    if (raw_name === "") {
      // A zero-length match means the next char is `=` (e.g. `<rect ="x"/>`
      // or a missing inter-attribute separator like `a="1"="2"`). Nameless
      // tokens would enter the model and collide with local-keyed lookups.
      throw new Error("expected attribute name at " + i);
    }
    // Capture whitespace before '=' (round-trips via eq_trivia).
    const eq_start = i;
    while (i < n && /\s/.test(src[i])) i++;
    const eq_trivia = src.slice(eq_start, i);
    if (i >= n) throw new Error("unterminated start tag");
    if (src[i] !== "=") {
      // Valueless ("boolean") attributes are not well-formed XML. The old
      // treat-as-empty tolerance was accept-then-corrupt: the token had no
      // value-presence flag, so serialization fabricated `=""` and fused
      // the trailing separator into the next attribute. Strict beats
      // corrupt — refuse at the door like every other malformed shape.
      throw new Error("expected '=' after attribute name at " + i);
    }
    i++; // consume '='
    // Capture whitespace after '=' (round-trips via eq_trailing).
    const tw_start = i;
    while (i < n && /\s/.test(src[i])) i++;
    const eq_trailing = src.slice(tw_start, i);
    const quote = src[i];
    if (quote !== '"' && quote !== "'") {
      throw new Error("expected attribute quote at " + i);
    }
    i++;
    const val_start = i;
    while (i < n && src[i] !== quote) i++;
    if (i >= n) throw new Error("unterminated attribute value");
    const raw_value = src.slice(val_start, i);
    i++; // closing quote
    const [prefix, local] = split_qname(raw_name);
    attrs.push({
      raw_name,
      prefix,
      local,
      ns: null,
      value: decode_entities(raw_value),
      pre,
      eq_trivia,
      eq_trailing,
      quote: quote as '"' | "'",
    });
    pre = "";
  }
  throw new Error("unterminated start tag");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decode_code_point(cp: number): string {
  // XML 1.0 §4.1: a character reference must denote a character matching
  // the §2.2 Char production — TAB/LF/CR, then the BMP minus surrogates
  // and FFFE/FFFF, then the supplementary planes. NUL and other C0
  // controls are NOT legal XML even as references; decoding them would
  // re-emit raw control bytes no conforming parser accepts. Validating
  // here also keeps the parser's controlled Error shape (fromCodePoint
  // would escape a raw RangeError and silently mint lone surrogates).
  const legal =
    cp === 0x9 ||
    cp === 0xa ||
    cp === 0xd ||
    (cp >= 0x20 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) ||
    (cp >= 0x10000 && cp <= 0x10ffff);
  if (!legal) {
    throw new Error("invalid character reference: " + cp);
  }
  return String.fromCodePoint(cp);
}

function decode_entities(s: string): string {
  // Note: the regex matches only lowercase `#x` — uppercase `&#X..;` is
  // not a valid XML CharRef and passes through as literal text.
  return s.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (_, ent) => {
      if (ent.startsWith("#x")) {
        return decode_code_point(parseInt(ent.slice(2), 16));
      }
      if (ent.startsWith("#")) {
        return decode_code_point(parseInt(ent.slice(1), 10));
      }
      return NAMED_ENTITIES[ent] ?? `&${ent};`;
    }
  );
}

export function encode_attr_value(value: string, quote: '"' | "'"): string {
  let out = value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  out =
    quote === '"' ? out.replace(/"/g, "&quot;") : out.replace(/'/g, "&apos;");
  return out;
}

export function encode_text(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

export { SVG_NS, XLINK_NS, XML_NS, XMLNS_NS };
