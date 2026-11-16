import { describe, expect, it } from "vitest";
import { welcome_message } from "./welcome-message";

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  };
}

const PROFILE = "a".repeat(64);

describe("welcome_message", () => {
  it("hands a stashed message over once", () => {
    const storage = memoryStorage();
    expect(
      welcome_message.stash(
        "workspace-a",
        { text: "Make a poster", profileId: PROFILE },
        storage
      )
    ).toBe(true);
    expect(welcome_message.peek("workspace-a", storage)).toEqual({
      text: "Make a poster",
      profileId: PROFILE,
    });
    expect(welcome_message.peek("workspace-b", storage)).toBeNull();
    expect(welcome_message.take("workspace-a", storage)).toBe("Make a poster");
    // A second taker, or the same chat after a reload, gets nothing.
    expect(welcome_message.take("workspace-a", storage)).toBeNull();
    expect(welcome_message.peek("workspace-a", storage)).toBeNull();
  });

  it("hands over settings and the original selected File once", () => {
    const storage = memoryStorage();
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });
    const message = {
      text: "Read these notes",
      profileId: PROFILE,
      effort: "high" as const,
      operatingRegime: "plan" as const,
      goal: false,
      attachment: { kind: "file" as const, file },
    };
    expect(welcome_message.stash("settings", message, storage)).toBe(true);
    expect(welcome_message.peek("settings", storage)).toEqual(message);
    expect(
      welcome_message.takeMessage("settings", storage)?.attachment?.file
    ).toBe(file);
    expect(welcome_message.takeMessage("settings", storage)).toBeNull();
  });

  it("keeps an unavailable original attachment explicit instead of sending text alone", () => {
    const storage = memoryStorage();
    storage.entries.set(
      "grida.welcome.message.v1.reload",
      JSON.stringify({
        text: "Read these notes",
        profileId: null,
        effort: "low",
        attachment: {
          token: "from-another-page-runtime",
          kind: "directory",
          name: "References",
        },
      })
    );
    expect(welcome_message.takeMessage("reload", storage)).toEqual({
      text: "Read these notes",
      profileId: null,
      effort: "low",
      missingAttachment: { kind: "directory", name: "References" },
    });
  });

  it("reports a window that cannot keep the message", () => {
    expect(
      welcome_message.stash(
        "workspace-a",
        { text: "Make a poster", profileId: null },
        {
          setItem: () => {
            throw new Error("quota");
          },
        }
      )
    ).toBe(false);
    expect(
      welcome_message.stash(
        "workspace-a",
        { text: "Make a poster", profileId: null },
        undefined
      )
    ).toBe(false);
  });

  it.each([
    "not json",
    JSON.stringify({ text: "", profileId: null }),
    JSON.stringify({ text: "Ask", profileId: "not-a-profile" }),
    JSON.stringify({ text: 1, profileId: null }),
    JSON.stringify({ text: "Ask", profileId: null, effort: "maximum" }),
    JSON.stringify({
      text: "Ask",
      profileId: null,
      operatingRegime: "unknown",
    }),
    JSON.stringify({ text: "Ask", profileId: null, goal: "yes" }),
    JSON.stringify({ text: "Ask", profileId: null, attachment: { token: 4 } }),
  ])("reads and removes a malformed entry as none (%s)", (raw) => {
    const storage = memoryStorage();
    storage.entries.set("grida.welcome.message.v1.workspace-a", raw);
    expect(welcome_message.peek("workspace-a", storage)).toBeNull();
    expect(welcome_message.take("workspace-a", storage)).toBeNull();
    expect(storage.entries.size).toBe(0);
  });

  describe("compose", () => {
    it("sends the person's text as written, and nothing for an empty composer", () => {
      expect(welcome_message.compose({ text: "  Make a poster \n" })).toBe(
        "Make a poster"
      );
      expect(welcome_message.compose({ text: "   " })).toBeNull();
    });

    it("names the template copy the chat should edit", () => {
      const template = {
        title: "Startup Pitch",
        slides: 12,
        path: "startup-pitch 2.canvas",
      };
      expect(
        welcome_message.compose({
          text: "A pitch for a bakery",
          template,
          references: [{ title: "Ignored", url: "https://example.test/a" }],
        })
      ).toBe(
        'A pitch for a bakery\n\nTemplate: "Startup Pitch" (12 slides), copied to `startup-pitch 2.canvas`. Edit that deck and keep its visual system.'
      );
      expect(welcome_message.compose({ text: "", template })).toMatch(
        /^Adapt the "Startup Pitch" slides template\.\n\nTemplate:/
      );
    });

    it("lists references after the ask", () => {
      expect(
        welcome_message.compose({
          text: "",
          references: [
            { title: "Dune", url: "https://example.test/dune" },
            { title: "", url: "https://example.test/untitled" },
          ],
        })
      ).toBe(
        "Use these visual references as the starting point.\n\nReferences:\n- Dune: https://example.test/dune\n- reference: https://example.test/untitled"
      );
    });
  });
});
