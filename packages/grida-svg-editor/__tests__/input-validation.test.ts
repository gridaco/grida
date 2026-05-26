// Boundary type-checks on the three svg-editor entry points that funnel
// into `parse_svg`: the `SvgDocument` constructor, `SvgDocument.load`,
// and `createSvgEditor({ svg })`. Each entry checks its own argument so
// the thrown stack frame names the API the caller actually invoked —
// not the internal parser. See gridaco/grida#746.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import { createSvgEditor } from "../src/core/editor";

const VALID = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

describe("SvgDocument constructor input validation", () => {
  it("throws a TypeError naming the API when svg is undefined", () => {
    expect(() => new SvgDocument(undefined as unknown as string)).toThrow(
      /new SvgDocument\(svg\) requires a string source, got undefined/
    );
  });

  it("throws a TypeError when svg is null", () => {
    expect(() => new SvgDocument(null as unknown as string)).toThrow(
      /new SvgDocument\(svg\) requires a string source, got null/
    );
  });

  it("accepts a string", () => {
    expect(() => new SvgDocument(VALID)).not.toThrow();
  });
});

describe("SvgDocument.load input validation", () => {
  it("throws a TypeError naming the API when svg is undefined", () => {
    const doc = new SvgDocument(VALID);
    expect(() => doc.load(undefined as unknown as string)).toThrow(
      /SvgDocument\.load\(svg\) requires a string source, got undefined/
    );
  });

  it("throws a TypeError when svg is null", () => {
    const doc = new SvgDocument(VALID);
    expect(() => doc.load(null as unknown as string)).toThrow(
      /SvgDocument\.load\(svg\) requires a string source, got null/
    );
  });
});

describe("createSvgEditor input validation", () => {
  it("throws a TypeError when opts is undefined", () => {
    expect(() =>
      createSvgEditor(undefined as unknown as { svg: string })
    ).toThrow(/createSvgEditor\(\{ svg \}\) requires \{ svg: string \}/);
  });

  it("throws a TypeError when opts.svg is undefined", () => {
    expect(() =>
      createSvgEditor({ svg: undefined as unknown as string })
    ).toThrow(
      /createSvgEditor\(\{ svg \}\) requires \{ svg: string \}, got svg=undefined/
    );
  });

  it("throws a TypeError when opts.svg is null", () => {
    expect(() => createSvgEditor({ svg: null as unknown as string })).toThrow(
      /createSvgEditor\(\{ svg \}\) requires \{ svg: string \}, got svg=null/
    );
  });

  it("accepts a valid options object", () => {
    expect(() => createSvgEditor({ svg: VALID })).not.toThrow();
  });
});
