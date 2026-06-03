/**
 * Contract pins — deterministic session-title policy.
 * Fork title rule: docs/wg/ai/agent/session.md §Forking.
 */
import { describe, expect, it } from "vitest";
import { session_title } from "./title";

describe("session_title", () => {
  it("DEFAULT is the 'New Chat' sentinel", () => {
    expect(session_title.DEFAULT).toBe("New Chat");
  });

  it("isDefault matches only the sentinel", () => {
    expect(session_title.isDefault("New Chat")).toBe(true);
    expect(session_title.isDefault("Design the logo")).toBe(false);
    expect(session_title.isDefault("")).toBe(false);
  });

  describe("forFork", () => {
    it("suffixes a real parent title with ' (copy)'", () => {
      expect(session_title.forFork("Design the logo")).toBe(
        "Design the logo (copy)"
      );
    });

    it("leaves an untitled parent at DEFAULT so the titler can name the copy", () => {
      expect(session_title.forFork(session_title.DEFAULT)).toBe(
        session_title.DEFAULT
      );
    });
  });
});
