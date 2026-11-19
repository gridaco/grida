import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { toast } from "sonner";
import { Toaster } from "@app/ui/components/sonner";
import type {
  DesktopNativeChat,
  NativeChatCatalogEntry,
  NativeChatPage,
} from "@grida/desktop-bridge";
import { NativeAgentPane } from "./native-agent-pane";
import "@/app/ui.css";

vi.mock("@/app/(library)/library/attachment", () => ({
  readLibraryAttachment: async () => null,
}));
vi.mock("../shared/agent-library-attachment-picker", () => ({
  AgentLibraryAttachmentPicker: () => null,
}));

const roots: Root[] = [];
afterEach(() => {
  act(() => toast.dismiss());
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

async function setup() {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await page.viewport(860, 800);
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  const running = new Set<string>();
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
  };
  const container = document.createElement("section");
  container.className = "flex h-[760px] w-[820px] flex-col bg-background";
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const render = (initialSession: string) =>
    act(async () =>
      root.render(
        <>
          <NativeAgentPane
            bridge={bridge}
            initialSession={initialSession}
            sideChatPlacement={{ present() {}, withdraw() {} }}
          />
          <Toaster />
        </>
      )
    );
  await render(first);
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
    composer,
    container,
    bridge,
    list,
    catalog,
    entries,
    organize,
    render,
    first,
    second,
    running,
  };
}

async function click(name: string) {
  await act(async () =>
    page.getByRole("button", { name, exact: true }).click()
  );
}

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

it("keeps the background chat's running indicator current after switching chats", async () => {
  const f = await setup();
  f.running.add(f.first);
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
  await expect.element(indicator(second)).not.toBeInTheDocument();

  f.running.clear();
  await expect
    .element(indicator(first), { timeout: 5_000 })
    .not.toBeInTheDocument();
  await expect.element(first).toBeVisible();
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

  it("keeps chat-list search focus through an update and restores its trigger on Escape", async () => {
    const f = await setup();
    const pending = Promise.withResolvers<NativeChatPage>();
    f.list.mockImplementationOnce(() => pending.promise);
    await click("Open chat list");
    const search = page.getByPlaceholder("Search chats…");
    await expect.element(search).toBeVisible();
    await act(async () => search.fill("First"));
    await act(async () => pending.resolve(f.catalog));
    await expect
      .poll(() => document.activeElement?.getAttribute("placeholder"))
      .toBe("Search chats…");
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
    page.getByRole("menuitem", { name: "Archive chat", exact: true }).click()
  );
}

describe("Native chat archive navigation", () => {
  it("opens a focused new draft after confirmation without creating a session and keeps the archived draft", async () => {
    const f = await setup();
    await act(async () =>
      userEvent.fill(f.composer, "Keep my archived chat draft")
    );
    await archiveChat();
    await expectComposerFocus(f.composer, "");
    await expect
      .element(page.getByText("Chat archived", { exact: true }))
      .toBeVisible();
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
    // Archived chats remain readable by ID; reopening retains their unsent text.
    await f.render(f.first);
    await expect
      .element(page.getByText("First saved request", { exact: true }))
      .toBeVisible();
    await expectComposerFocus(f.composer, "Keep my archived chat draft");
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
