import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { toast } from "sonner";
import { Toaster } from "@app/ui/components/sonner";
import type {
  DesktopNativeChat,
  NativeChatCatalogEntry,
  NativeChatMessage,
  NativeChatPage,
  NativeChatProfileCatalog,
  NativeChatUpdate,
} from "@grida/desktop-bridge";
import {
  NativeAgentPane,
  NativeAgentPaneGate,
  NativeSideChatPane,
} from "./native-agent-pane";
import { PanelTabContent } from "./workbench-panel-content";
import { NativeChatController } from "@/lib/agent-chat/native-chat-controller";
import "@/app/ui.css";

vi.mock("@/app/(library)/library/attachment", () => ({
  readLibraryAttachment: async () => null,
}));
vi.mock("../shared/agent-library-attachment-picker", () => ({
  AgentLibraryAttachmentPicker: () => null,
}));

const roots: Root[] = [];
const sides: NativeChatController[] = [];
afterEach(() => {
  act(() => toast.dismiss());
  for (const root of roots.splice(0)) act(() => root.unmount());
  for (const side of sides.splice(0)) side.disconnect();
  document.body.replaceChildren();
});

async function setup(
  overrides: Partial<DesktopNativeChat> = {},
  { waitForHistory = true, sideChat = false } = {}
) {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await page.viewport(860, 800);
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  const running = new Set<string>();
  const inputNeeded = new Set<string>();
  const activityTimes = new Map<string, number>();
  const entries = new Map<string, NativeChatCatalogEntry>([
    [
      first,
      { sessionId: first, revision: 0, title: "First chat", archived: false },
    ],
    [
      second,
      { sessionId: second, revision: 0, title: "Second chat", archived: false },
    ],
  ]);
  const listing = (archived: boolean): NativeChatPage => ({
    sessionIds: [...entries.values()]
      .filter((entry) => entry.archived === archived)
      .map((entry) => entry.sessionId),
    titles: [...entries.values()].flatMap(({ sessionId, title }) =>
      title === null ? [] : [{ sessionId, title }]
    ),
    runningSessionIds: [...running].filter(
      (id) => entries.get(id)?.archived === archived
    ),
    inputNeededSessionIds: [...inputNeeded].filter(
      (id) => entries.get(id)?.archived === archived
    ),
    lastActivity: [...activityTimes].map(([sessionId, atMs]) => ({
      sessionId,
      atMs,
    })),
    nextCursor: null,
  });
  const catalog = listing(false);
  const list = vi.fn<DesktopNativeChat["list"]>(async () => listing(false));
  const organize = vi.fn<NonNullable<DesktopNativeChat["organize"]>>(
    async (sessionId, change) => {
      const saved = { sessionId, ...change, revision: change.revision + 1 };
      entries.set(sessionId, saved);
      return saved;
    }
  );
  const bridge: DesktopNativeChat = {
    status: async () => "native-ready",
    takeNotificationFocus: async () => null,
    inputReceipt: async () => {
      throw new Error("input_unavailable");
    },
    list,
    listArchived: async () => listing(true),
    catalogEntry: async (sessionId) => entries.get(sessionId)!,
    organize,
    selection: async (target) => ({
      target,
      revision: 0,
      available: true,
      selection: { profileId: null, modelId: "test-model", effort: "medium" },
    }),
    updateSelection: vi.fn<NonNullable<DesktopNativeChat["updateSelection"]>>(),
    createFromDraft: vi.fn<NonNullable<DesktopNativeChat["createFromDraft"]>>(),
    create: vi.fn<DesktopNativeChat["create"]>(),
    load: async (id) => ({ sessionId: id, attachmentId: id }),
    detach: async () => {},
    submit: vi.fn<DesktopNativeChat["submit"]>(),
    observe: async (id) => ({
      observationId: `observation-${id}`,
      snapshot: {
        sessionId: id,
        sessionRevision: 0,
        queuedInputs: 0,
        admissionPaused: false,
        current: null,
        latest: null,
      },
    }),
    transcript: async (id) => [
      {
        messageId: `message-${id}`,
        role: "user",
        text: id === first ? "First saved request" : "Second saved request",
      },
    ],
    control: vi.fn<DesktopNativeChat["control"]>(),
    subscribe: async () => "subscription",
    unsubscribe: async () => {},
    ...overrides,
  };
  const container = document.createElement("section");
  container.className = "flex h-[760px] w-[820px] flex-col bg-background";
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const side = sideChat
    ? new NativeChatController(bridge, undefined, undefined, undefined, false, {
        open: async () => ({ sessionId: first, attachmentId: first }),
        effort: "medium",
        profiles: null,
      })
    : undefined;
  if (side) {
    sides.push(side);
    side.connect(null);
    await side.opened();
  }
  const render = (initialSession: string, presented = true) =>
    act(async () =>
      root.render(
        <>
          {side ? (
            <PanelTabContent
              active={presented}
              panel={{
                title: "Side chat",
                content: (
                  <NativeSideChatPane
                    presentation={{
                      id: first,
                      chat: side,
                      host: { bridge },
                      focus: 1,
                      close() {},
                    }}
                  />
                ),
              }}
            />
          ) : (
            <NativeAgentPane
              bridge={bridge}
              initialSession={initialSession}
              sideChatPlacement={{ present() {}, withdraw() {} }}
            />
          )}
          <Toaster />
        </>
      )
    );
  await render(first);
  if (waitForHistory)
    await expect
      .element(page.getByText("First saved request", { exact: true }))
      .toBeVisible();
  await expect
    .poll(() => container.querySelector('[contenteditable="true"]'))
    .not.toBeNull();
  const composer = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  return {
    root,
    composer,
    container,
    bridge,
    list,
    catalog,
    entries,
    activityTimes,
    organize,
    render,
    first,
    second,
    running,
    inputNeeded,
  };
}

async function click(name: string) {
  await act(async () =>
    page.getByRole("button", { name, exact: true }).click()
  );
}

it("keeps a plain Welcome message available through workspace startup retries", async () => {
  const f = await setup();
  const open = vi.fn<NonNullable<DesktopNativeChat["startWorkspaceChat"]>>(
    async () => ({ readiness: "native-unavailable" })
  );
  const take = vi.fn<() => { text: string }>(() => ({ text: "Make a poster" }));
  await act(async () =>
    f.root.render(
      <NativeAgentPaneGate
        bridge={{
          ...f.bridge,
          status: async () => "native-starting",
          startWorkspaceChat: open,
        }}
        workspaceId="project"
        firstMessage={{
          profileId: null,
          waiting: () => take.mock.calls.length === 0,
          take,
        }}
        initialSession={null}
        sideChatPlacement={{ present() {}, withdraw() {} }}
      />
    )
  );
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent("Your message from Home is still waiting to send.");
  await click("Retry");
  await expect.poll(() => open.mock.calls.length).toBe(2);
  expect(take).not.toHaveBeenCalled();
});

it.each([
  "Retry",
  "choose another model",
  "choose a model in an empty workspace",
])(
  "waits for a workspace worker before reading capabilities and accepts the first message once after %s",
  async (recovery) => {
    const f = await setup();
    const fromHome = recovery !== "choose a model in an empty workspace";
    const profileId = "a".repeat(64);
    let selection: string | null = null;
    let ready = false;
    const id = crypto.randomUUID();
    const capability = vi.fn<NonNullable<DesktopNativeChat["acceptsPng"]>>(
      async () => {
        if (!ready) throw new Error("native_chat_unavailable");
        return false;
      }
    );
    const take = vi.fn<() => { text: string }>(() => ({
      text: "Make a poster",
    }));
    const submit = vi.fn<DesktopNativeChat["submit"]>(
      async (sessionId, inputId) => ({
        sessionId,
        inputId,
        disposition: "claimed",
        inputPosition: 1,
        turnId: "turn",
      })
    );
    const bridge: DesktopNativeChat = {
      ...f.bridge,
      status: async () => "native-starting",
      startWorkspaceChat: async () => ({
        readiness: ready ? "native-ready" : "native-gateway-unavailable",
      }),
      profiles: async () => ({
        active: ready ? selection : null,
        choices: [{ id: profileId, connection: "Provider", model: "Studio" }],
        saved: [],
      }),
      selectProfile: async (choice) => {
        expect(choice).toEqual({ kind: "new", id: profileId });
        ready = true;
      },
      selection: async (target) => ({
        target,
        revision: 0,
        available: true,
        selection: {
          profileId: selection,
          modelId: "studio",
          effort: "medium",
        },
      }),
      updateSelection: async (target, revision, _, chosen) => {
        selection = chosen.profileId;
        return {
          target,
          revision: revision + 1,
          available: true,
          selection: { ...chosen, modelId: "studio" },
        };
      },
      acceptsPng: capability,
      submitImage: vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>(),
      createFromDraft: async () => ({
        attachmentId: id,
        sessionId: id,
        firstInputId: crypto.randomUUID(),
      }),
      submit,
    };
    await act(async () =>
      f.root.render(
        <NativeAgentPaneGate
          bridge={bridge}
          workspaceId={crypto.randomUUID()}
          initialSession={null}
          firstMessage={
            fromHome
              ? {
                  profileId: null,
                  waiting: () => take.mock.calls.length === 0,
                  take,
                }
              : undefined
          }
          sideChatPlacement={{ present() {}, withdraw() {} }}
        />
      )
    );
    expect(capability).not.toHaveBeenCalled();
    expect(take).not.toHaveBeenCalled();
    await expect
      .element(page.getByText(/Gateway is unavailable/))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "New chat" }))
      .toBeDisabled();
    const composer = f.container.querySelector<HTMLElement>(
      '[contenteditable="true"]'
    )!;
    if (!fromHome)
      await act(async () => userEvent.fill(composer, "Make a poster"));
    if (recovery === "Retry") {
      ready = true;
      await click("Retry");
    } else {
      await act(async () =>
        page.getByRole("combobox", { name: "Model connection" }).click()
      );
      await act(async () =>
        page.getByRole("option", { name: "Studio" }).click()
      );
      await expect.poll(() => selection).toBe(profileId);
      await expect.poll(() => composer.textContent).toBe("Make a poster");
      expect(submit).not.toHaveBeenCalled();
      await act(async () => {
        composer.focus();
        await userEvent.keyboard("{Enter}");
      });
    }
    await expect.poll(() => submit.mock.calls.length).toBe(1);
    expect(take).toHaveBeenCalledTimes(fromHome ? 1 : 0);
    expect(submit.mock.calls[0]?.[2]).toBe("Make a poster");
    await expect
      .element(page.getByRole("button", { name: "New chat" }))
      .toBeEnabled();
  }
);

it("reports a side tab as hidden while it stays mounted behind another tab", async () => {
  const setPresented = vi.fn<NonNullable<DesktopNativeChat["setPresented"]>>(
    async () => {}
  );
  const f = await setup({ setPresented }, { sideChat: true });
  expect(setPresented).toHaveBeenLastCalledWith(f.first, true);
  await f.render(f.first, false);
  expect(setPresented).toHaveBeenLastCalledWith(f.first, false);
  expect(
    f.container.querySelector('[data-testid="native-side-chat"]')
  ).not.toBeNull();
  await f.render(f.first, true);
  expect(setPresented).toHaveBeenLastCalledWith(f.first, true);
});

it.each(["main", "side"])(
  "reopens a dismissed optional question, displays its accepted reply inside Worked and expires the remaining question in a %s chat",
  async (kind) => {
    const turnId = "question-turn";
    const prompt = "Which edition?";
    let answered = false;
    let finished = false;
    const answer = vi.fn<NonNullable<DesktopNativeChat["answerQuestion"]>>(
      async (sessionId, reviewId, value) => {
        expect(reviewId).toBe("first-review");
        expect(value).toEqual({ kind: "text", text: "Large print" });
        answered = true;
        return {
          sessionId,
          turnId,
          requestId: "reply",
          sessionRevision: 2,
          journalPosition: 3,
        };
      }
    );
    await setup(
      {
        observe: async (id) => {
          const revision = finished ? 3 : answered ? 2 : 1;
          const turn = {
            turnId,
            epoch: 1,
            controlRevision: revision,
            historyPosition: revision,
            journalPosition: revision,
            paused: false,
            cancelled: false,
          };
          return {
            observationId: `review-${revision}`,
            snapshot: {
              sessionId: id,
              sessionRevision: revision,
              queuedInputs: 0,
              admissionPaused: false,
              current: finished
                ? null
                : { ...turn, disposition: "running", status: null },
              latest: finished
                ? { ...turn, disposition: "settled", status: "succeeded" }
                : null,
            },
          };
        },
        questions: async () =>
          finished
            ? []
            : [
                {
                  questionId: answered ? "next" : "first",
                  reviewId: answered ? "next-review" : "first-review",
                  question: answered ? "Any other preference?" : prompt,
                  style: "nonblocking",
                  expiresWithTurn: true,
                  options: [],
                },
              ],
        answerQuestion: answer,
        transcriptPage: async () => {
          const messages: NativeChatMessage[] = [
            {
              messageId: "initial",
              turnId,
              role: "user",
              text: "First saved request",
            },
          ];
          if (answered)
            messages.push({
              messageId: "answer",
              turnId,
              role: "user",
              text: "Large print",
              questionReply: { waitId: "wait-one", question: prompt },
            });
          if (finished)
            messages.push({
              messageId: "final",
              turnId,
              role: "assistant",
              text: "Completed the document.",
              phase: "answer",
            });
          return {
            view: 0,
            older: null,
            messages,
            turns: [
              {
                turnId,
                startedAtMs: 1000,
                status: finished ? "succeeded" : null,
                ...(finished && { settledAtMs: 2000 }),
              },
            ],
          };
        },
      },
      { sideChat: kind === "side" }
    );

    const input = page.getByRole("textbox", { name: prompt });
    await act(async () => input.fill("Large print"));
    await click("Close question");
    await click("Answer question");
    await expect.element(input).toHaveValue("Large print");
    await click("Skip");
    expect(answer).not.toHaveBeenCalled();
    await click("Answer question");
    await click("Submit");
    const quote = page.getByRole("blockquote").filter({ hasText: prompt });
    await expect.element(quote).toBeVisible();
    await expect
      .element(page.getByText("Large print", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Close question" }))
      .toBeVisible();
    await click("Skip");
    await expect
      .element(page.getByRole("button", { name: "Answer question" }))
      .toBeVisible();

    finished = true;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await expect
      .element(page.getByText("Completed the document."))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Answer question" }))
      .not.toBeInTheDocument();
    await expect.element(quote).not.toBeInTheDocument();
    await expect
      .element(page.getByText("Large print", { exact: true }))
      .not.toBeInTheDocument();
    await click("Worked for 1s");
    await expect.element(quote).toBeVisible();
    await expect
      .element(page.getByText("Large print", { exact: true }))
      .toBeVisible();
  }
);

describe("Composer control loading", () => {
  it("waits for the saved selection even when the catalog has already loaded empty", async () => {
    const initial = Promise.withResolvers<void>();
    const retry = Promise.withResolvers<void>();
    let reads = 0;
    await setup(
      {
        profiles: async () => ({ active: null, choices: [], saved: [] }),
        selection: async (target) => {
          await (reads++ === 0 ? initial.promise : retry.promise);
          return {
            target,
            revision: 0,
            available: true,
            selection: {
              profileId: null,
              modelId: "default",
              effort: "medium",
            },
          };
        },
      },
      { waitForHistory: false }
    );
    const loading = page.getByRole("status", { name: "Loading models…" });
    const label = page.getByText("Default model", { exact: true });
    await expect.element(loading).toBeVisible();
    await expect.element(label).not.toBeInTheDocument();
    await act(async () => initial.reject(new Error("offline")));
    await click("Retry loading models");
    await expect.element(loading).toBeVisible();
    await act(async () => retry.resolve());
    await expect.element(label).toBeVisible();
    expect(reads).toBe(2);
  });

  it("keeps editing through initial model failure, retry, and a later refresh", async () => {
    const initial = Promise.withResolvers<NativeChatProfileCatalog>();
    const retry = Promise.withResolvers<NativeChatProfileCatalog>();
    const refresh = Promise.withResolvers<NativeChatProfileCatalog>();
    const id = "a".repeat(64);
    const catalog = {
      active: null,
      choices: [{ id, model: "Studio model", connection: "Provider" }],
      saved: [],
    };
    const profiles = vi.fn<NonNullable<DesktopNativeChat["profiles"]>>(
      async () => catalog
    );
    profiles
      .mockImplementationOnce(() => initial.promise)
      .mockImplementationOnce(() => retry.promise)
      .mockImplementationOnce(() => refresh.promise);
    const f = await setup({
      profiles,
      selection: async (target) => ({
        target,
        revision: 0,
        available: true,
        selection: { profileId: id, modelId: "studio", effort: "high" },
      }),
    });
    const loading = page.getByRole("status", { name: "Loading models…" });
    const picker = page.getByRole("combobox", { name: "Model connection" });
    await expect.element(loading).toBeVisible();
    await expect
      .element(page.getByText("Default model", { exact: true }))
      .not.toBeInTheDocument();
    await act(async () => userEvent.fill(f.composer, "Keep writing"));
    await act(async () => initial.reject(new Error("offline")));
    await click("Retry loading models");
    await expect.element(loading).toBeVisible();
    await act(async () => retry.resolve(catalog));
    await expect.element(picker).toHaveTextContent("Studio modelHigh");
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(profiles).toHaveBeenCalledTimes(3);
    await expect.element(picker).toHaveTextContent("Studio modelHigh");
    await expect.element(loading).not.toBeInTheDocument();
    await act(async () => refresh.resolve(catalog));
    expect(f.composer.textContent).toBe("Keep writing");
  });

  it("restores Full access after a delayed read and keeps it visible during refresh", async () => {
    const pending = Promise.withResolvers<void>();
    let reopen = false;
    let notify: ((update: NativeChatUpdate) => void) | undefined;
    const permissionMode = vi.fn<
      NonNullable<DesktopNativeChat["permissionMode"]>
    >(async (sessionId) => {
      if (reopen) await pending.promise;
      return {
        sessionId,
        revision: 0,
        mode: reopen ? "full_access" : "restricted",
        available: ["restricted", "full_access"],
      };
    });
    const f = await setup({
      acceptsPermissionMode: async () => true,
      permissionMode,
      subscribe: async (_id, update) => {
        notify = update;
        return "subscription";
      },
    });
    const defaultAccess = page.getByRole("button", { name: "Access: Default" });
    const width = (element: Element) => element.getBoundingClientRect().width;
    await expect.element(defaultAccess).toBeVisible();
    const wideWidth = width(defaultAccess.element());
    f.container.style.width = "360px";
    const compactWidth = width(defaultAccess.element());
    expect(compactWidth).toBeLessThan(wideWidth);

    reopen = true;
    await f.render(f.second);
    const checking = page.getByRole("status", { name: "Checking access…" });
    await expect.element(checking).toBeVisible();
    expect(width(checking.element())).toBeCloseTo(compactWidth);
    f.container.style.removeProperty("width");
    expect(width(checking.element())).toBeCloseTo(wideWidth);
    await expect
      .element(page.getByRole("button", { name: "Access: Default" }))
      .not.toBeInTheDocument();
    expect(f.composer.isContentEditable).toBe(true);
    await act(async () => pending.resolve());
    const full = page.getByRole("button", { name: "Access: Full access" });
    await expect.element(full).toBeVisible();
    await expect.element(checking).not.toBeInTheDocument();
    await expect
      .element(page.getByText("Second saved request", { exact: true }))
      .toBeVisible();

    const refresh =
      Promise.withResolvers<Awaited<ReturnType<typeof permissionMode>>>();
    const reads = permissionMode.mock.calls.length;
    permissionMode.mockImplementationOnce(() => refresh.promise);
    await act(async () => notify?.({ kind: "resync" }));
    await expect.poll(() => permissionMode.mock.calls.length).toBe(reads + 1);
    await expect.element(full).toBeVisible();
    await expect.element(checking).not.toBeInTheDocument();
    await act(async () => refresh.reject(new Error("offline")));
    await click("Access: Access unknown");
    await click("Check access");
    await expect.element(full).toBeVisible();
  });
});

async function selectChat(title: string) {
  await click("Open chat list");
  await act(async () => page.getByRole("option", { name: title }).click());
  // Wait for the closing popover's focus restoration, not just the selection.
  await expect
    .poll(() => document.querySelector('[placeholder="Search chats…"]'))
    .toBeNull();
}

async function expectComposerFocus(composer: HTMLElement, text: string) {
  await expect.poll(() => composer.textContent).toBe(text);
  await expect.poll(() => document.activeElement).toBe(composer);
  expect(window.getSelection()?.isCollapsed).toBe(true);
  const range = document.createRange();
  range.selectNodeContents(composer);
  range.setEnd(
    window.getSelection()!.focusNode!,
    window.getSelection()!.focusOffset
  );
  expect(range.toString()).toBe(text);
}

it("shows a reopened chat's catalog title in the header and picker when the titler finishes", async () => {
  const f = await setup();
  const initial: NativeChatCatalogEntry = {
    ...f.entries.get(f.second)!,
    title: "First request excerpt",
    titleGenerationPending: true,
  };
  f.entries.set(f.second, initial);
  await selectChat("First request excerpt");
  await expect.element(page.getByTitle("First request excerpt")).toBeVisible();
  const transcript = vi.spyOn(f.bridge, "transcript");
  await click("Open chat list");
  await expect
    .element(page.getByRole("option", { name: initial.title! }))
    .toBeVisible();

  f.entries.set(f.second, {
    ...initial,
    revision: initial.revision + 1,
    title: "Spring launch kit",
    titleGenerationPending: undefined,
  });
  await expect
    .element(page.getByRole("option", { name: "Spring launch kit" }), {
      timeout: 5_000,
    })
    .toBeVisible();
  await expect.element(page.getByTitle("Spring launch kit")).toBeVisible();
  expect(transcript).not.toHaveBeenCalled();
});

it("keeps background running and input indicators current after switching chats", async () => {
  const f = await setup();
  f.running.add(f.first);
  f.inputNeeded.add(f.first);
  await selectChat("Second chat");
  await expect.element(page.getByText("Second saved request")).toBeVisible();
  const load = vi.spyOn(f.bridge, "load");
  const transcript = vi.spyOn(f.bridge, "transcript");

  await click("Open chat list");
  const first = page.getByRole("option", { name: /First chat/ });
  const second = page.getByRole("option", { name: /Second chat/ });
  const indicator = (row: typeof first) =>
    row.getByRole("status", { name: "Running" });
  await expect.element(indicator(first)).toBeVisible();
  await expect.element(first.getByText("Input needed")).toBeVisible();
  await expect.element(indicator(second)).not.toBeInTheDocument();

  f.running.clear();
  await expect
    .element(indicator(first), { timeout: 5_000 })
    .not.toBeInTheDocument();
  await expect.element(first).toBeVisible();
  await expect.element(first.getByText("Input needed")).toBeVisible();
  f.inputNeeded.clear();
  await expect
    .element(first.getByText("Input needed"), { timeout: 5_000 })
    .not.toBeInTheDocument();
  await expect.element(second).toBeVisible();
  expect(load).not.toHaveBeenCalled();
  expect(transcript).not.toHaveBeenCalled();
});

describe("Native chat composer focus", () => {
  it("focuses new chats and restored chat drafts at the end without remounting", async () => {
    const f = await setup();
    await expectComposerFocus(f.composer, "");
    await act(async () => userEvent.fill(f.composer, "First unsent draft"));
    await click("New chat");
    await expectComposerFocus(f.composer, "");
    await act(async () => userEvent.fill(f.composer, "New unsent draft"));
    await click("New chat");
    await expectComposerFocus(f.composer, "");
    await selectChat("Second chat");
    await expectComposerFocus(f.composer, "");
    await act(async () => userEvent.fill(f.composer, "Second unsent draft"));
    await selectChat("First chat");
    await expectComposerFocus(f.composer, "First unsent draft");
    await selectChat("Second chat");
    await expectComposerFocus(f.composer, "Second unsent draft");
    await selectChat("Second chat");
    await expectComposerFocus(f.composer, "Second unsent draft");
    expect(f.container.querySelector('[contenteditable="true"]')).toBe(
      f.composer
    );
    expect(f.bridge.submit).not.toHaveBeenCalled();
  });

  it("opens the chat list on the current chat and keeps focus in search", async () => {
    const f = await setup();
    f.activityTimes.set(f.first, Date.now());
    f.activityTimes.set(f.second, 0);
    await selectChat("Second chat");
    const pending = Promise.withResolvers<NativeChatPage>();
    const catalog = await f.list(null);
    f.list.mockImplementationOnce(() => pending.promise);
    await click("Open chat list");
    const search = page.getByPlaceholder("Search chats…");
    const first = page.getByRole("option", { name: "First chat" });
    const second = page.getByRole("option", { name: "Second chat" });
    await expect.element(search).toHaveFocus();
    await expect
      .element(page.getByText("Today", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByText("Earlier", { exact: true }))
      .toBeVisible();
    await expect.element(first).toHaveAttribute("aria-selected", "false");
    await expect.element(second).toHaveAttribute("aria-selected", "true");
    await act(async () => search.fill("First"));
    await act(async () => pending.resolve(catalog));
    await expect.element(search).toHaveFocus();
    await expect.element(first).toHaveAttribute("aria-selected", "true");
    await expect
      .element(page.getByText("Today", { exact: true }))
      .not.toBeInTheDocument();
    await act(async () => search.fill(""));
    await expect.element(second).toBeVisible();
    await expect
      .element(page.getByText("Earlier", { exact: true }))
      .toBeVisible();
    await act(async () => userEvent.keyboard("{Escape}"));
    await expect
      .poll(() => document.activeElement?.getAttribute("aria-label"))
      .toBe("Open chat list");
    expect(f.composer.textContent).toBe("");
  });
});

async function archiveChat() {
  await click("Chat options");
  await act(async () =>
    page.getByRole("menuitem", { name: "Archive", exact: true }).click()
  );
}

async function setupArchiveUndo() {
  const undoArchive = vi.fn<NonNullable<DesktopNativeChat["undoArchive"]>>();
  const f = await setup({ undoArchive });
  const receipt = "archive-receipt";
  f.organize.mockImplementationOnce(async (sessionId, change) => {
    const saved = { ...change, sessionId, revision: 1 };
    f.entries.set(sessionId, saved);
    return { ...saved, archiveUndo: receipt };
  });
  const restore = async () => {
    const entry = f.entries.get(f.first)!;
    f.entries.set(f.first, { ...entry, archived: false, revision: 2 });
  };
  undoArchive.mockImplementation(restore);
  return { ...f, undoArchive, receipt, restore };
}

describe("Native chat archive navigation", () => {
  it("opens a focused new draft after confirmation without creating a session and keeps the archived draft", async () => {
    const draftReady = Promise.withResolvers<void>();
    const f = await setup({
      selection: async (target) => {
        if ("draftId" in target) await draftReady.promise;
        return {
          target,
          revision: 0,
          available: true,
          selection: {
            profileId: null,
            modelId: "test-model",
            effort: "medium",
          },
        };
      },
    });
    await act(async () =>
      userEvent.fill(f.composer, "Keep my archived chat draft")
    );
    await archiveChat();
    await expect
      .element(page.getByText("Chat archived", { exact: true }))
      .toBeVisible();
    await act(async () => draftReady.resolve());
    await expectComposerFocus(f.composer, "");
    await expect
      .element(page.getByText("First saved request", { exact: true }))
      .not.toBeInTheDocument();
    expect(f.entries.get(f.first)?.archived).toBe(true);
    expect(f.bridge.create).not.toHaveBeenCalled();
    expect(f.bridge.createFromDraft).not.toHaveBeenCalled();
    expect(f.bridge.submit).not.toHaveBeenCalled();

    await f.render(f.second);
    await expect
      .element(page.getByText("Second saved request", { exact: true }))
      .toBeVisible();
    // The toast still targets the archived chat after opening another chat.
    await click("View");
    await expect
      .element(page.getByText("First saved request", { exact: true }))
      .toBeVisible();
    await expectComposerFocus(f.composer, "Keep my archived chat draft");
  });

  it("reopens the chat Undo restored from an empty replacement draft", async () => {
    const f = await setupArchiveUndo();

    await archiveChat();
    await expectComposerFocus(f.composer, "");
    await expect
      .element(page.getByRole("button", { name: "View" }))
      .toBeVisible();
    const view = page
      .getByRole("button", { name: "View", exact: true })
      .element();
    const undo = page
      .getByRole("button", { name: "Undo", exact: true })
      .element();
    const gap =
      undo.getBoundingClientRect().left - view.getBoundingClientRect().right;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(8);
    await click("Undo");

    expect(f.undoArchive).toHaveBeenCalledExactlyOnceWith(f.receipt);
    expect(f.entries.get(f.first)?.archived).toBe(false);
    await expect
      .element(page.getByText("First saved request", { exact: true }))
      .toBeVisible();
    expect(f.bridge.create).not.toHaveBeenCalled();
    expect(f.bridge.submit).not.toHaveBeenCalled();
  });

  it("restores the archive without interrupting a new draft with text", async () => {
    const f = await setupArchiveUndo();
    await archiveChat();
    await expectComposerFocus(f.composer, "");
    await act(async () => userEvent.fill(f.composer, "Keep the new draft"));
    await click("Undo");

    expect(f.entries.get(f.first)?.archived).toBe(false);
    expect(f.composer.textContent).toBe("Keep the new draft");
    await expect
      .element(page.getByText("First saved request", { exact: true }))
      .not.toBeInTheDocument();
    await act(async () => userEvent.fill(f.composer, ""));
  });

  it("restores the archive without interrupting a chat opened while Undo is in flight", async () => {
    const f = await setupArchiveUndo();
    const response = Promise.withResolvers<void>();
    f.undoArchive.mockImplementationOnce(async () => {
      await response.promise;
      await f.restore();
    });
    await archiveChat();
    await click("Undo");
    await f.render(f.second);
    await expect
      .element(page.getByText("Second saved request", { exact: true }))
      .toBeVisible();

    await act(async () => response.resolve());

    expect(f.undoArchive).toHaveBeenCalledExactlyOnceWith(f.receipt);
    expect(f.entries.get(f.first)?.archived).toBe(false);
    await expect
      .element(page.getByText("Second saved request", { exact: true }))
      .toBeVisible();
  });

  it("keeps the current chat and shows no success toast when archive is refused", async () => {
    const f = await setup();
    f.organize.mockRejectedValueOnce(new Error("archive_refused"));
    await archiveChat();
    await expect
      .element(
        page.getByText("Couldn't confirm the change. Try again.", {
          exact: true,
        })
      )
      .toBeVisible();
    await expect
      .element(page.getByText("First saved request", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByText("Chat archived", { exact: true }))
      .not.toBeInTheDocument();
    expect(f.entries.get(f.first)?.archived).toBe(false);
    expect(f.bridge.create).not.toHaveBeenCalled();
    expect(f.bridge.createFromDraft).not.toHaveBeenCalled();
  });

  it("does not redirect a different chat when an old archive response arrives", async () => {
    const f = await setup();
    const pending = Promise.withResolvers<NativeChatCatalogEntry>();
    f.organize.mockImplementationOnce(() => pending.promise);
    await archiveChat();
    // Another navigation can select a chat while its archive request is pending.
    await f.render(f.second);
    await expect
      .element(page.getByText("Second saved request", { exact: true }))
      .toBeVisible();
    await expectComposerFocus(f.composer, "");
    await act(async () => userEvent.fill(f.composer, "Keep working here"));
    await act(async () =>
      pending.resolve({
        ...f.entries.get(f.first)!,
        archived: true,
        revision: 1,
      })
    );
    await expect
      .element(page.getByText("Second saved request", { exact: true }))
      .toBeVisible();
    expect(f.composer.textContent).toBe("Keep working here");
    await expect
      .element(page.getByText("Chat archived", { exact: true }))
      .not.toBeInTheDocument();
    expect(f.bridge.create).not.toHaveBeenCalled();
    expect(f.bridge.createFromDraft).not.toHaveBeenCalled();
  });
});
