// Tokenizer-level coverage for attribute trivia capture and the strict
// attribute grammar. The byte-exact round-trip half lives with the
// serializer (the SVG editor package); these tests pin the parse half so
// this package can prove its own contract — a serializer rewrite upstream
// must not be the only thing standing between a tokenizer regression and
// a green suite here.

import { describe, expect, it } from "vitest";
import { parse_svg } from "../parser";

function attrs_of_rect(src: string) {
  const result = parse_svg(src);
  for (const node of result.nodes.values()) {
    if (node.kind === "element" && node.local === "rect") return node.attrs;
  }
  throw new Error("no <rect> in fixture");
}

describe("attribute trivia capture", () => {
  it("captures whitespace around `=` into eq_trivia / eq_trailing", () => {
    const [fill] = attrs_of_rect(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect fill = "red"/></svg>`
    );
    expect(fill.raw_name).toBe("fill");
    expect(fill.eq_trivia).toBe(" ");
    expect(fill.eq_trailing).toBe(" ");
    expect(fill.value).toBe("red");
  });

  it("captures multi-space and newline trivia after `=`", () => {
    const [a] = attrs_of_rect(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect fill =  'red'/></svg>`
    );
    expect(a.eq_trailing).toBe("  ");
    expect(a.quote).toBe("'");
    const [b] = attrs_of_rect(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect fill =\n"red"/></svg>`
    );
    expect(b.eq_trailing).toBe("\n");
  });

  it("captures empty trivia for the common tight form", () => {
    const [fill] = attrs_of_rect(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="red"/></svg>`
    );
    expect(fill.eq_trivia).toBe("");
    expect(fill.eq_trailing).toBe("");
  });
});

describe("strict attribute grammar", () => {
  it("throws on a valueless (boolean) attribute", () => {
    // Not well-formed XML; the old treat-as-empty tolerance serialized
    // corrupted markup (`name =""` fused into the next attribute).
    expect(() =>
      parse_svg(`<svg xmlns="http://www.w3.org/2000/svg"><rect hidden/></svg>`)
    ).toThrow(/expected '='/);
    expect(() =>
      parse_svg(
        `<svg xmlns="http://www.w3.org/2000/svg"><rect hidden fill="red"/></svg>`
      )
    ).toThrow(/expected '='/);
  });

  it("throws a controlled Error on malformed character references", () => {
    // The reference must denote a legal XML Char (XML 1.0 §2.2 via §4.1):
    // beyond-Unicode, surrogates, NUL, and C0 controls are all malformed —
    // and must surface as the parser's Error shape, not a raw RangeError
    // escaping String.fromCodePoint (or raw control bytes on re-emit).
    for (const ref of ["&#x110000;", "&#xD800;", "&#0;", "&#8;", "&#xFFFE;"]) {
      expect(() =>
        parse_svg(
          `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="${ref}"/></svg>`
        )
      ).toThrow(/invalid character reference/);
    }
    // TAB/LF/CR references are legal Chars and must keep decoding.
    expect(() =>
      parse_svg(
        `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="a&#10;b"/></svg>`
      )
    ).not.toThrow();
  });

  it("throws on an empty attribute name", () => {
    expect(() =>
      parse_svg(`<svg xmlns="http://www.w3.org/2000/svg"><rect ="red"/></svg>`)
    ).toThrow(/expected attribute name/);
    // Missing inter-attribute separator must not tokenize as a nameless attr.
    expect(() =>
      parse_svg(
        `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="a"="b"/></svg>`
      )
    ).toThrow(/expected attribute name/);
  });

  it("diagnoses truncation as unterminated, not as a missing '='", () => {
    expect(() =>
      parse_svg(`<svg xmlns="http://www.w3.org/2000/svg"><rect fill`)
    ).toThrow(/unterminated start tag/);
    expect(() =>
      parse_svg(`<svg xmlns="http://www.w3.org/2000/svg"><rect fill   `)
    ).toThrow(/unterminated start tag/);
  });
});
