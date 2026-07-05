import { describe, expect, it } from "vitest";
import {
  detectSlashTrigger,
  fuzzyFilterSkills,
  toMenuItems,
  isSlashCommand,
  buildHintPattern,
  expandSlashCommand,
  UnknownSkillError,
} from "./slash";
import type { DiscoveredSkill } from "./types";

describe("detectSlashTrigger", () => {
  it("activates on a leading slash token and hides on whitespace", () => {
    expect(detectSlashTrigger("", 0)).toEqual({ active: false, query: "" });
    expect(detectSlashTrigger("/", 1)).toEqual({ active: true, query: "" });
    expect(detectSlashTrigger("/sli", 4)).toEqual({
      active: true,
      query: "sli",
    });
    expect(detectSlashTrigger("  /sli", 6)).toEqual({
      active: true,
      query: "sli",
    });
    expect(detectSlashTrigger("hello /sl", 9).active).toBe(false);
    expect(detectSlashTrigger("/foo bar", 8).active).toBe(false);
    // caret mid-token
    expect(detectSlashTrigger("/foo", 2)).toEqual({ active: true, query: "f" });
  });

  it("clamps an out-of-range caret without throwing", () => {
    expect(detectSlashTrigger("/x", 999)).toEqual({ active: true, query: "x" });
    expect(detectSlashTrigger("/x", -5)).toEqual({ active: false, query: "" });
  });
});

describe("fuzzyFilterSkills", () => {
  const items = [{ name: "slides" }, { name: "svg" }, { name: "dotcanvas" }];
  it("ranks exact > prefix > substring > subsequence and drops non-matches", () => {
    expect(fuzzyFilterSkills(items, "s").map((s) => s.name)).toEqual([
      "svg", // prefix (rank 1), shorter name wins the tie vs slides
      "slides", // prefix (rank 1)
      "dotcanvas", // substring (rank 2 — "dotcanvaS")
    ]);
    expect(fuzzyFilterSkills(items, "dc").map((s) => s.name)).toEqual([
      "dotcanvas", // subsequence d…c
    ]);
    expect(fuzzyFilterSkills(items, "zzz")).toEqual([]);
  });
  it("returns a fresh copy in order for an empty query", () => {
    const out = fuzzyFilterSkills(items, "  ");
    expect(out).not.toBe(items);
    expect(out.map((s) => s.name)).toEqual(["slides", "svg", "dotcanvas"]);
  });
});

describe("toMenuItems", () => {
  it("maps discovery source to a friendly label", () => {
    const skills: DiscoveredSkill[] = [
      { name: "slides", description: "deck", path: "/a", source: "bundled" },
      { name: "x", description: "y", path: "/b", source: "project" },
    ];
    const items = toMenuItems(skills);
    expect(items[0]).toMatchObject({
      name: "slides",
      sourceLabel: "built-in",
      argsHint: "[args]",
    });
    expect(items[1]?.sourceLabel).toBe("workspace");
  });
});

describe("expandSlashCommand", () => {
  const known = ["slides", "svg"];
  it("is an identity for non-slash input", () => {
    const r = expandSlashCommand("hello world", known);
    expect(r).toEqual({
      raw: "hello world",
      expanded: "hello world",
      skillName: null,
      arguments: null,
    });
  });
  it("expands a bare command to a header-only hint", () => {
    const r = expandSlashCommand("/slides", known);
    expect(r.skillName).toBe("slides");
    expect(r.expanded).toBe(buildHintPattern("slides", ""));
    expect(r.expanded).not.toContain("ARGUMENTS:");
  });
  it("consumes one separator space and preserves the rest", () => {
    const r = expandSlashCommand("/slides make a deck", known);
    expect(r.arguments).toBe("make a deck");
    expect(r.expanded).toContain("ARGUMENTS: make a deck");
  });
  it("throws UnknownSkillError for an unknown token", () => {
    expect(() => expandSlashCommand("/nope", known)).toThrow(UnknownSkillError);
  });
  it("isSlashCommand recognizes the token grammar", () => {
    expect(isSlashCommand("/slides")).toBe(true);
    expect(isSlashCommand("/a:b arg")).toBe(true);
    expect(isSlashCommand("not a command")).toBe(false);
  });
});
