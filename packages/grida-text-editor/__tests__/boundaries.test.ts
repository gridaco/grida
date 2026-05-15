import { describe, expect, it } from "vitest";
import {
  next_grapheme,
  next_word,
  prev_grapheme,
  prev_word,
  word_at,
} from "../src/boundaries";

describe("grapheme boundaries", () => {
  it("steps one char forward in plain text", () => {
    expect(next_grapheme("hello", 0)).toBe(1);
    expect(next_grapheme("hello", 2)).toBe(3);
  });

  it("clamps at end of text", () => {
    expect(next_grapheme("hi", 2)).toBe(2);
  });

  it("steps one char backward", () => {
    expect(prev_grapheme("hello", 3)).toBe(2);
    expect(prev_grapheme("hello", 1)).toBe(0);
  });

  it("clamps at start of text", () => {
    expect(prev_grapheme("hi", 0)).toBe(0);
  });

  const has_segmenter =
    typeof (globalThis as { Intl?: { Segmenter?: unknown } }).Intl
      ?.Segmenter === "function";

  it.skipIf(!has_segmenter)(
    "treats family-emoji ZWJ sequence as one grapheme",
    () => {
      // Family emoji: 👨‍👩‍👧 (man + ZWJ + woman + ZWJ + girl) — 8 JS code units.
      const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
      expect(next_grapheme(family, 0)).toBe(family.length);
      expect(prev_grapheme(family, family.length)).toBe(0);
    }
  );
});

describe("word boundaries", () => {
  it("next_word jumps past the current word", () => {
    expect(next_word("hello world", 0)).toBe(5);
    expect(next_word("hello world", 3)).toBe(5);
  });

  it("next_word jumps over space to start of next word", () => {
    expect(next_word("hello world foo", 5)).toBe(11);
  });

  it("prev_word jumps to start of the previous word", () => {
    expect(prev_word("hello world", 11)).toBe(6);
    expect(prev_word("hello world", 6)).toBe(0);
  });

  it("word_at returns the word containing the index", () => {
    expect(word_at("hello world", 2)).toEqual({ start: 0, end: 5 });
    expect(word_at("hello world", 5)).toEqual({ start: 0, end: 5 });
    expect(word_at("hello world", 8)).toEqual({ start: 6, end: 11 });
  });

  it("word_at deep in whitespace returns zero-width", () => {
    const r = word_at("a   b", 2); // strictly inside the space run
    expect(r.end).toBe(r.start);
  });
});
