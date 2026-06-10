import { describe, expect, it } from "vitest";
import { fragment } from "./fragment";

describe("fragment.strip_shell", () => {
  it("extracts inner markup and viewBox from a standalone document", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
    const { inner, viewbox } = fragment.strip_shell(svg);
    expect(inner).toBe(`<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>`);
    expect(viewbox).toEqual({ min_x: 0, min_y: 0, width: 24, height: 24 });
  });

  it("keeps inner bytes verbatim — attribute order, comments, whitespace", () => {
    const inner = `\n  <!-- keep me -->\n  <g  stroke='red'   fill="none">\n    <circle r="4" cx="2"/>\n  </g>\n`;
    const { inner: out } = fragment.strip_shell(
      `<svg viewBox="0 0 10 10">${inner}</svg>`
    );
    expect(out).toBe(inner);
  });

  it("passes a bare fragment through with no viewBox", () => {
    const bare = `<g><rect width="4" height="4"/></g>`;
    expect(fragment.strip_shell(bare)).toEqual({
      inner: bare,
      viewbox: null,
      xmlns: [],
    });
  });

  it("collects the shell's prefixed xmlns declarations verbatim", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:xlink='http://www.w3.org/1999/xlink' viewBox="0 0 24 24"><path inkscape:label="x"/></svg>`;
    const { xmlns } = fragment.strip_shell(svg);
    expect(xmlns).toEqual([
      `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"`,
      `xmlns:xlink='http://www.w3.org/1999/xlink'`,
    ]);
  });

  it("does not collect the default xmlns declaration", () => {
    const { xmlns } = fragment.strip_shell(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect/></svg>`
    );
    expect(xmlns).toEqual([]);
  });

  it("handles prolog/doctype before the root element", () => {
    const svg = `<?xml version="1.0"?><!DOCTYPE svg><svg viewBox="-5 -5 10 10"><rect/></svg>`;
    const { inner, viewbox } = fragment.strip_shell(svg);
    expect(inner).toBe("<rect/>");
    expect(viewbox).toEqual({ min_x: -5, min_y: -5, width: 10, height: 10 });
  });

  it("reads comma-separated viewBox values", () => {
    const { viewbox } = fragment.strip_shell(
      `<svg viewBox="0,0,16,32"><rect/></svg>`
    );
    expect(viewbox).toEqual({ min_x: 0, min_y: 0, width: 16, height: 32 });
  });
});

describe("fragment.position", () => {
  it("centers the viewBox on the target point via an authored translate", () => {
    const svg = `<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>`;
    expect(fragment.position(svg, { x: 100, y: 50 })).toBe(
      `<g transform="translate(88 38)"><path d="M0 0h24v24H0z"/></g>`
    );
  });

  it("accounts for a non-zero viewBox origin", () => {
    const svg = `<svg viewBox="10 20 4 8"><rect/></svg>`;
    // box center is (12, 24) → translate moves it onto (0, 0).
    expect(fragment.position(svg, { x: 0, y: 0 })).toBe(
      `<g transform="translate(-12 -24)"><rect/></g>`
    );
  });

  it("lands the local origin on the point when no viewBox is declared", () => {
    expect(fragment.position(`<circle r="3"/>`, { x: 7.125, y: -3 })).toBe(
      `<g transform="translate(7.13 -3)"><circle r="3"/></g>`
    );
  });

  it("carries shell xmlns:* declarations onto the wrapper — prefixed content stays namespace-valid", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 24 24"><path inkscape:label="x" d="M0 0h24v24H0z"/></svg>`;
    expect(fragment.position(svg, { x: 100, y: 50 })).toBe(
      `<g xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" transform="translate(88 38)"><path inkscape:label="x" d="M0 0h24v24H0z"/></g>`
    );
  });
});
