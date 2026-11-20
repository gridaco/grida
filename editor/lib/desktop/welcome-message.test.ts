import { describe, expect, it } from "vitest";
import { welcome_message } from "./welcome-message";
import { workflowMessageContext } from "./workflow-message-context";
import { slidesTemplateMessageContext } from "./slides-message-context";

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
    expect(welcome_message.takeMessage("workspace-a", storage)?.text).toBe(
      "Make a poster"
    );
    // A second taker, or the same chat after a reload, gets nothing.
    expect(welcome_message.takeMessage("workspace-a", storage)).toBeNull();
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
      preparedSessionId: "abf7864b-6bd5-4d77-9159-7d17ddbed879",
      preparedMode: "approve_for_me" as const,
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
    JSON.stringify({
      text: "Ask",
      profileId: null,
      preparedMode: "approve_for_me",
    }),
    JSON.stringify({
      text: "Ask",
      profileId: null,
      preparedSessionId: "not-a-session",
    }),
    JSON.stringify({ text: "Ask", profileId: null, attachment: { token: 4 } }),
    JSON.stringify({
      text: "Ask",
      profileId: null,
      messageContext: { modelText: "Malformed", displayParts: [null] },
    }),
    JSON.stringify({
      text: "",
      profileId: null,
      messageContext: workflowMessageContext([]),
    }),
  ])("reads and removes a malformed entry as none (%s)", (raw) => {
    const storage = memoryStorage();
    storage.entries.set("grida.welcome.message.v1.workspace-a", raw);
    expect(welcome_message.peek("workspace-a", storage)).toBeNull();
    expect(welcome_message.takeMessage("workspace-a", storage)).toBeNull();
    expect(storage.entries.size).toBe(0);
  });

  it.each([
    "Use the prompt from 1.\nMatch the layout from 2.",
    "<grida-desktop-context>My own markup</grida-desktop-context>",
    "",
  ])(
    "stashes the complete workflow context beside authored text (%j)",
    (text) => {
      const storage = memoryStorage();
      const messageContext = workflowMessageContext([
        {
          number: 1,
          title: "Pet",
          showcaseUrl: "https://grida.co/fx/workflows/pet",
          sourceUrl: "https://github.com/gridaco/fx/tree/main/examples/pet",
          templateId: "pet",
        },
        {
          number: 2,
          title: "Nine-slice UI kit",
          showcaseUrl: "https://grida.co/fx/workflows/ui-kit",
          sourceUrl: "https://github.com/gridaco/fx/tree/main/examples/ui-kit",
        },
      ]);
      const message = { text, profileId: PROFILE, messageContext };

      expect(welcome_message.stash("workflow", message, storage)).toBe(true);
      expect(welcome_message.peek("workflow", storage)).toEqual(message);
      expect(welcome_message.takeMessage("workflow", storage)).toEqual(message);
      expect(welcome_message.takeMessage("workflow", storage)).toBeNull();
      expect(messageContext.modelText).toContain(
        '<reference number="1" title="Pet"'
      );
      expect(messageContext.modelText).toContain(
        '<reference number="2" title="Nine-slice UI kit"'
      );
    }
  );

  it("restores a template-only request with an empty authored message", () => {
    const storage = memoryStorage();
    const message = {
      text: "",
      profileId: null,
      messageContext: slidesTemplateMessageContext({
        title: "Startup Pitch",
        slides: 12,
        path: "startup-pitch 2.canvas",
      }),
    };
    expect(welcome_message.stash("slides", message, storage)).toBe(true);
    expect(welcome_message.takeMessage("slides", storage)).toEqual(message);
    expect(welcome_message.takeMessage("slides", storage)).toBeNull();
  });

  describe("compose", () => {
    it("sends the person's text as written, and nothing for an empty composer", () => {
      expect(welcome_message.compose({ text: "  Make a poster \n" })).toBe(
        "Make a poster"
      );
      expect(welcome_message.compose({ text: "   " })).toBeNull();
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
