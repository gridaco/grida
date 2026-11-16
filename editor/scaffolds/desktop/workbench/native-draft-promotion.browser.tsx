import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type {
  DesktopNativeChat,
  NativeChatSelectionState,
  NativeChatSelectionTarget,
} from "@grida/desktop-bridge";
import { AgentComposerInput } from "../shared/agent-composer-input";
import {
  ComposerDrafts,
  type ComposerDraftBlob,
} from "@/lib/agent-chat/composer-drafts";
import { NativeChatController } from "@/lib/agent-chat/native-chat-controller";
import "@/app/ui.css";

const resources: { root: Root; controller: NativeChatController }[] = [];
afterEach(() => {
  for (const { root, controller } of resources.splice(0)) {
    act(() => root.unmount());
    controller.disconnect();
  }
  document.body.replaceChildren();
});

function fixture() {
  const profile = "b".repeat(64);
  let active: string | null = profile;
  let defaults = {
    profileId: profile,
    modelId: "model-b",
    effort: "high" as const,
  };
  const states = new Map<string, NativeChatSelectionState>();
  const key = (target: NativeChatSelectionTarget) =>
    target.sessionId ?? target.draftId!;
  const values = new Map<string, string>();
  const blobs = new Map<string, ComposerDraftBlob>();
  const moveStarted = Promise.withResolvers<void>();
  const releaseMove = Promise.withResolvers<void>();
  let copying = false;
  const memory = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const store = new ComposerDrafts(null, {
    get: async (key) => {
      if (copying && key.startsWith("\0pending:workspace:draft/")) {
        moveStarted.resolve();
        await releaseMove.promise;
      }
      return blobs.get(key) ?? null;
    },
    put: async (key, value) => {
      blobs.set(key, value);
    },
    delete: async (key) => {
      blobs.delete(key);
    },
  });
  const selectionStarted = Promise.withResolvers<void>();
  const releaseSelection = Promise.withResolvers<void>();
  const bridge: DesktopNativeChat = {
    status: async () => "native-ready",
    takeNotificationFocus: async () => null,
    list: async () => ({ sessionIds: [], nextCursor: null }),
    create: vi.fn<DesktopNativeChat["create"]>(async () => {
      throw new Error("unexpected_legacy_create");
    }),
    load: vi.fn<DesktopNativeChat["load"]>(async (sessionId) => ({
      attachmentId: sessionId,
      sessionId,
    })),
    detach: async () => {},
    submit: vi.fn<DesktopNativeChat["submit"]>(async (sessionId, inputId) => ({
      sessionId,
      inputId,
      inputPosition: 1,
      turnId: "accepted-turn",
      disposition: "claimed",
    })),
    inputReceipt: vi.fn<DesktopNativeChat["inputReceipt"]>(async () => {
      throw new Error("input_unavailable");
    }),
    observe: async (sessionId) => ({
      observationId: `observation-${sessionId}`,
      snapshot: {
        sessionId,
        sessionRevision: 1,
        queuedInputs: 0,
        admissionPaused: false,
        current: null,
        latest: null,
      },
    }),
    transcript: async () => [],
    control: async () => {
      throw new Error("unexpected_control");
    },
    subscribe: async () => "subscription",
    unsubscribe: async () => {},
    selection: vi.fn<NonNullable<DesktopNativeChat["selection"]>>(
      async (target) => {
        if (target.sessionId === "created") {
          selectionStarted.resolve();
          await releaseSelection.promise;
        }
        if (!states.has(key(target)))
          states.set(key(target), {
            target,
            revision: 1,
            selection: { ...defaults },
            available: true,
          });
        return structuredClone(states.get(key(target))!);
      }
    ),
    updateSelection: vi.fn<NonNullable<DesktopNativeChat["updateSelection"]>>(
      async (target, expected, _operation, choice) => {
        if ("draftId" in target)
          throw new Error("native_chat_draft_creation_pending");
        const previous = states.get(key(target))!;
        if (previous.revision !== expected)
          throw new Error("selection_revision_changed");
        const selected = { ...choice, modelId: "model-b" };
        const state = {
          target,
          revision: expected + 1,
          selection: selected,
          available: true,
        };
        states.set(key(target), state);
        return structuredClone(state);
      }
    ),
    profiles: async () => ({
      active,
      modelChanges: true,
      choices: [
        { id: profile, connection: "B", model: "Model B", ultra: true },
      ],
      saved: [],
    }),
    selectProfile: vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
      async (selection) => {
        active = selection.kind === "default" ? null : selection.id;
      }
    ),
    createFromDraft: vi.fn<NonNullable<DesktopNativeChat["createFromDraft"]>>(
      async (draftId) => {
        states.set("created", {
          ...states.get(draftId)!,
          target: { sessionId: "created" },
          revision: 1,
        });
        return {
          attachmentId: "created",
          sessionId: "created",
          firstInputId: "stable-first-input",
        };
      }
    ),
    submitInRegime: vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
      async (_action, sessionId, inputId) => ({
        sessionId,
        inputId,
        inputPosition: 1,
        turnId: "accepted-turn",
        disposition: "claimed",
      })
    ),
    acceptsEffort: async () => true,
  };
  bridge.enqueue = bridge.submit;
  vi.mocked(bridge.createFromDraft!).mockRejectedValueOnce(
    new Error("native_agent_invalid_response")
  );
  const move = store.move.bind(store);
  vi.spyOn(store, "move").mockImplementation(async (from, to) => {
    if (to === "workspace:created") copying = true;
    await move(from, to);
  });
  const controller = new NativeChatController(
    bridge,
    memory,
    "promotion-browser"
  );
  controller.keepDrafts(store, "workspace");
  controller.connect(null);
  return {
    controller,
    bridge,
    store,
    selectionStarted,
    releaseSelection,
    moveStarted,
    releaseMove,
  };
}

function Composer({ controller }: { controller: NativeChatController }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  return (
    <section
      aria-label="Draft promotion composer"
      style={{ width: 420, padding: 16 }}
    >
      <AgentComposerInput
        draft={controller.composerDraft()}
        catalog={{ commands: [], mentions: [] }}
        awaitSubmission
        submissionScope={state.scope}
        canSubmit={controller.canSubmit}
        busy={false}
        isStreaming={false}
        onSubmit={(text) => controller.submit(text, state.scope)}
        onStop={() => {}}
        toolbarEnd={
          <button
            type="button"
            onClick={() => controller.selectEffort("medium")}
          >
            Use Medium effort
          </button>
        }
      />
    </section>
  );
}

it("keeps typed text visible through failed creation and a metadata-only promotion with delayed draft copy, then sends once", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await page.viewport(468, 400);
  const f = fixture();
  await expect.poll(() => f.controller.canSubmit).toBe(true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  resources.push({ root, controller: f.controller });
  await act(async () => root.render(<Composer controller={f.controller} />));
  await expect.poll(() => f.controller.read().loading).toBe(false);
  await expect
    .poll(() => container.querySelector('[contenteditable="true"]'))
    .not.toBeNull();
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const typed = "Keep this exact unsent draft while the chat recovers.";
  await act(async () => userEvent.type(editor, typed));
  await expect.poll(() => editor.textContent).toBe(typed);
  await expect
    .poll(
      () =>
        container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')
          ?.disabled
    )
    .toBe(false);
  const oldKey = f.controller.draftKey()!;
  const snapshots: string[] = [editor.textContent!];
  const observer = new MutationObserver(() =>
    snapshots.push(editor.textContent ?? "")
  );
  observer.observe(editor, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  try {
    await act(async () =>
      page.getByRole("button", { name: "Send", exact: true }).click()
    );
    await expect
      .poll(() => container.textContent)
      .toContain("Couldn't confirm the send");
    expect(f.bridge.createFromDraft).toHaveBeenCalledOnce();
    expect(editor.textContent).toBe(typed);
    expect(f.controller.draftKey()).toBe(oldKey);
    await act(async () =>
      page
        .getByRole("button", { name: "Use Medium effort", exact: true })
        .click()
    );
    await f.selectionStarted.promise;
    expect(editor.textContent).toBe(typed);
    expect(f.controller.draftKey()).toBe(oldKey);
    await act(async () => f.releaseSelection.resolve());
    await f.moveStarted.promise;
    await act(async () => {
      await f.controller.readProfiles();
      await new Promise(requestAnimationFrame);
    });
    expect(editor.isConnected).toBe(true);
    expect(editor.textContent).toBe(typed);
    expect(f.controller.draftKey()).toBe(oldKey);
    expect(f.store.read("workspace:created")).toBeNull();
    expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
    expect(f.bridge.submit).not.toHaveBeenCalled();
    expect(f.bridge.selectProfile).not.toHaveBeenCalled();
    const additional = " More details typed during the copy.";
    await act(async () => {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      await userEvent.keyboard(additional);
    });
    const latest = typed + additional;
    await expect.poll(() => editor.textContent).toBe(latest);
    expect(f.controller.draftKey()).toBe(oldKey);
    expect(JSON.stringify(f.store.read(oldKey))).toContain(latest);
    await act(async () => f.releaseMove.resolve());
    await expect.poll(() => f.controller.read().profileBusy).toBe(false);
    await expect.poll(() => f.controller.draftKey()).toBe("workspace:created");
    expect(editor.isConnected).toBe(true);
    expect(editor.textContent).toBe(latest);
    expect(
      snapshots.every(
        (text) => latest.startsWith(text) && text.startsWith(typed)
      )
    ).toBe(true);
    expect(JSON.stringify(f.store.read("workspace:created"))).toContain(latest);
    expect(f.store.read(oldKey)).toBeNull();
    expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
    expect(f.bridge.selectProfile).not.toHaveBeenCalled();
    expect(vi.mocked(f.bridge.createFromDraft!).mock.calls[0]).toEqual(
      vi.mocked(f.bridge.createFromDraft!).mock.calls[1]
    );
    await page.screenshot({
      path: "../../../../output/playwright/desktop-activity/draft-after-metadata-recovery.png",
      element: page.getByRole("region", { name: "Draft promotion composer" }),
    });
    observer.disconnect();
    await act(async () =>
      page.getByRole("button", { name: "Send", exact: true }).click()
    );
    await expect
      .poll(() => vi.mocked(f.bridge.submitInRegime!).mock.calls.length)
      .toBe(1);
    expect(
      vi.mocked(f.bridge.submitInRegime!).mock.calls[0].slice(0, 4)
    ).toEqual(["submit", "created", "stable-first-input", latest]);
    await expect.poll(() => editor.textContent).toBe("");
    expect(f.bridge.createFromDraft).toHaveBeenCalledTimes(2);
    expect(f.bridge.selectProfile).not.toHaveBeenCalled();
  } finally {
    observer.disconnect();
    f.releaseSelection.resolve();
    f.releaseMove.resolve();
  }
});
