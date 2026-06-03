import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { home } from "../src/index";

const HOME = "/Users/test";

describe("home.dir", () => {
  it("honors GRIDA_HOME when set and absolute", () => {
    expect(home.dir({ env: { GRIDA_HOME: "/custom/grida" }, home: HOME })).toBe(
      "/custom/grida"
    );
  });

  it("falls back to <home>/.grida when GRIDA_HOME unset", () => {
    expect(home.dir({ env: {}, home: HOME })).toBe(path.join(HOME, ".grida"));
  });

  it("falls back when GRIDA_HOME is empty", () => {
    expect(home.dir({ env: { GRIDA_HOME: "" }, home: HOME })).toBe(
      path.join(HOME, ".grida")
    );
  });

  it("falls back when GRIDA_HOME is relative (not absolute)", () => {
    expect(
      home.dir({ env: { GRIDA_HOME: "relative/grida" }, home: HOME })
    ).toBe(path.join(HOME, ".grida"));
  });

  it("rebases on injected home", () => {
    expect(home.dir({ env: {}, home: "/other/home" })).toBe(
      path.join("/other/home", ".grida")
    );
  });

  it("same location regardless of platform (no per-OS branching)", () => {
    // There is deliberately no `platform` input — the location is
    // <home>/.grida on every OS. This pins that the resolver is platform-free.
    expect(home.dir({ env: {}, home: HOME })).toBe(path.join(HOME, ".grida"));
  });
});

describe("home.join", () => {
  it("returns <home>/agent", () => {
    expect(home.join("agent", { env: {}, home: HOME })).toBe(
      path.join(HOME, ".grida", "agent")
    );
  });

  it("honors GRIDA_HOME for the root", () => {
    expect(
      home.join("agent", { env: { GRIDA_HOME: "/custom/grida" }, home: HOME })
    ).toBe(path.join("/custom/grida", "agent"));
  });
});

describe("defaults", () => {
  it("with no options, defaults env to process.env and home to os.homedir()", () => {
    // Don't assert a machine-dependent absolute value; assert the contract:
    // the no-arg call is identical to passing the real host facts explicitly.
    expect(home.dir()).toBe(home.dir({ env: process.env, home: os.homedir() }));
  });

  it("exposes stable ENV and DIRNAME constants", () => {
    expect(home.ENV).toBe("GRIDA_HOME");
    expect(home.DIRNAME).toBe(".grida");
  });
});
