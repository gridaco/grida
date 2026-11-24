import { describe, expect, it, vi } from "vitest";
import { welcome_message, type WelcomeDraftTransfer } from "./welcome-message";
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

  it("keeps an exact personal skill selection through the first-message handoff", () => {
    const storage = memoryStorage();
    const skills = [
      { name: "slides", uri: `grida-skill:slides@${"f".repeat(64)}` },
    ];
    const document = { type: "doc", content: [{ type: "paragraph" }] };
    expect(
      welcome_message.stash(
        "destination",
        {
          text: "",
          profileId: PROFILE,
          skills,
          document,
        },
        storage
      )
    ).toBe(true);
    expect(welcome_message.peek("destination", storage)).toMatchObject({
      text: "",
      skills,
      document,
    });
    const arrived = welcome_message.pending("destination", storage)?.take();
    expect(arrived?.skills).toEqual(skills);
    arrived?.commit?.();
    expect(welcome_message.peek("destination", storage)).toBeNull();
  });

  it("does not let an older pane consume a replacement handoff", () => {
    const storage = memoryStorage();
    const message = { text: "Look this up", profileId: PROFILE };
    welcome_message.stash("workspace-a", message, storage);
    const older = welcome_message.pending("workspace-a", storage)!;
    expect(older.waiting()).toBe(true);
    welcome_message.stash("workspace-a", message, storage);
    expect(older.waiting()).toBe(false);
    expect(older.peek()).toBeNull();
    expect(older.take()).toBeNull();
    const replacement = welcome_message.pending("workspace-a", storage)!;
    const preview = replacement.peek();
    expect(preview).toMatchObject({
      ...message,
      requestId: expect.any(String),
    });
    expect(replacement.peek()).toBe(preview);
    const claimed = replacement.take();
    expect(claimed).toMatchObject(preview!);
    expect(replacement.take()).toBeNull();
    expect(replacement.peek()).toBe(preview);
    claimed?.commit?.();
    expect(replacement.peek()).toBeNull();
  });

  it("carries the captured request identity and same-window draft transfer into the destination", () => {
    const storage = memoryStorage();
    const requestId = crypto.randomUUID();
    const transferNextDraft = vi.fn<WelcomeDraftTransfer>();
    const message = {
      text: "Look this up",
      profileId: PROFILE,
      requestId,
      transferNextDraft,
    };
    expect(welcome_message.stash("workspace-a", message, storage)).toBe(true);
    const pending = welcome_message.pending("workspace-a", storage)!;
    expect(pending.peek()).toEqual(message);
    expect(storage.entries.values().next().value).not.toContain(
      "transferNextDraft"
    );
    const claimed = pending.take();
    expect(claimed).toMatchObject(message);
    expect(welcome_message.pending("workspace-a", storage)?.peek()).toEqual(
      message
    );
    claimed?.commit?.();
    expect(welcome_message.pending("workspace-a", storage)).toBeNull();
  });

  it("allows one window claimant and releases an abandoned request without consuming it", () => {
    const storage = memoryStorage();
    const message = {
      text: "One first message",
      profileId: PROFILE,
      requestId: crypto.randomUUID(),
    };
    welcome_message.stash("workspace-release", message, storage);
    const firstPane = welcome_message.pending("workspace-release", storage)!;
    const remount = welcome_message.pending("workspace-release", storage)!;
    const claimed = firstPane.take()!;
    expect(remount.peek()?.requestId).toBe(message.requestId);
    expect(remount.waiting()).toBe(false);
    expect(remount.take()).toBeNull();
    claimed.release?.();
    expect(remount.waiting()).toBe(true);
    const replacement = remount.take()!;
    expect(() => claimed.commit?.()).toThrow("The Home message changed");
    expect(remount.peek()?.requestId).toBe(message.requestId);
    replacement.commit?.();
    expect(remount.peek()).toBeNull();
  });

  it.each(["read", "remove", "no-op removal"] as const)(
    "blocks handoff commit on %s failure and permits an exact explicit retry",
    (failure) => {
      const storage = memoryStorage();
      const workspaceId = `workspace-${failure}`;
      const message = { text: "Keep this message", profileId: PROFILE };
      welcome_message.stash(workspaceId, message, storage);
      const pending = welcome_message.pending(workspaceId, storage)!;
      const claimed = pending.take()!;
      const operation = failure === "read" ? "getItem" : "removeItem";
      const failing = vi.spyOn(storage, operation);
      if (failure === "no-op removal") failing.mockImplementation(() => null);
      else
        failing.mockImplementation(() => {
          throw new Error("storage denied");
        });

      expect(() => claimed.commit?.()).toThrow(
        "Couldn't verify the Home message handoff"
      );
      failing.mockRestore();
      expect(pending.peek()?.text).toBe(message.text);
      claimed.release?.();
      expect(pending.waiting()).toBe(true);
      claimed.commit?.();
      expect(pending.peek()).toBeNull();
    }
  );

  it("keeps a replacement Home message when a stale claimant tries to commit", () => {
    const storage = memoryStorage();
    welcome_message.stash(
      "workspace",
      { text: "Earlier message", profileId: PROFILE },
      storage
    );
    const claimed = welcome_message.pending("workspace", storage)!.take()!;
    welcome_message.stash(
      "workspace",
      { text: "Newer message", profileId: PROFILE },
      storage
    );

    expect(() => claimed.commit?.()).toThrow("The Home message changed");
    expect(welcome_message.pending("workspace", storage)?.peek()?.text).toBe(
      "Newer message"
    );
    claimed.release?.();
  });

  it("requires a successful read after a claimed handoff was removed", () => {
    const storage = memoryStorage();
    welcome_message.stash(
      "workspace",
      { text: "Keep this message", profileId: PROFILE },
      storage
    );
    const claimed = welcome_message.pending("workspace", storage)!.take()!;
    const read = storage.getItem;
    const failing = vi
      .spyOn(storage, "getItem")
      .mockImplementationOnce(read)
      .mockImplementationOnce(() => {
        throw new Error("storage denied");
      });

    expect(() => claimed.commit?.()).toThrow(
      "Couldn't verify the Home message handoff"
    );
    failing.mockRestore();
    expect(welcome_message.pending("workspace", storage)).toBeNull();
    claimed.release?.();
    expect(() => claimed.commit?.()).not.toThrow();
    expect(() => claimed.commit?.()).not.toThrow();
  });

  it("keeps the explicit manual approval choice through navigation", () => {
    const storage = memoryStorage();
    const message = {
      text: "Check this",
      profileId: PROFILE,
      manualApproval: true as const,
    };
    welcome_message.stash("workspace-a", message, storage);
    expect(welcome_message.takeMessage("workspace-a", storage)).toEqual(
      message
    );
  });

  it("hands over settings and the original selected File once", () => {
    const storage = memoryStorage();
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });
    const message = {
      text: "Read these notes",
      profileId: PROFILE,
      effort: "high" as const,
      turnOptions: {
        profileId: PROFILE,
        modelId: "subscription-model",
        speed: "fast" as const,
        webSearch: true as const,
      },
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

  it("hands off every selected File in order without persisting browser custody", () => {
    const storage = memoryStorage();
    const notes = new File(["notes"], "same.txt");
    const sameName = new File(["different notes"], "same.txt");
    const folder = new File([], "References");
    const message = {
      text: "Compare these references",
      profileId: null,
      attachments: [
        { kind: "file" as const, file: notes },
        { kind: "directory" as const, file: folder },
        { kind: "file" as const, file: sameName },
      ],
    };
    expect(welcome_message.stash("batch", message, storage)).toBe(true);
    const peeked = welcome_message.peek("batch", storage);
    expect(peeked?.attachments?.map(({ file }) => file)).toEqual([
      notes,
      folder,
      sameName,
    ]);
    expect(peeked?.attachments?.[0].file).toBe(notes);
    expect(peeked?.attachments?.[2].file).toBe(sameName);
    expect(welcome_message.takeMessage("batch", storage)).toEqual(message);
    expect(welcome_message.takeMessage("batch", storage)).toBeNull();
  });

  it("keeps an entire unavailable batch explicit after process-local files disappear", () => {
    const storage = memoryStorage();
    storage.entries.set(
      "grida.welcome.message.v1.detached-batch",
      JSON.stringify({
        text: "Compare the references",
        profileId: null,
        attachments: {
          token: "gone",
          items: [
            { kind: "file", name: "a.png" },
            { kind: "directory", name: "References" },
            { kind: "file", name: "a.png" },
          ],
        },
      })
    );
    expect(welcome_message.takeMessage("detached-batch", storage)).toEqual({
      text: "Compare the references",
      profileId: null,
      missingAttachments: [
        { name: "a.png" },
        { name: "References" },
        { name: "a.png" },
      ],
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
      profileId: PROFILE,
      turnOptions: { profileId: PROFILE, modelId: "model", speed: "fastest" },
    }),
    JSON.stringify({
      text: "Ask",
      profileId: PROFILE,
      turnOptions: { profileId: PROFILE, modelId: "model", webSearch: false },
    }),
    JSON.stringify({
      text: "Ask",
      profileId: PROFILE,
      turnOptions: { modelId: "model", webSearch: true },
    }),
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
    JSON.stringify({ text: "Ask", profileId: null, manualApproval: false }),
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
