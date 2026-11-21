import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { TooltipProvider } from "@app/ui/components/tooltip";
import type {
  DesktopNativeChat,
  NativeChatMessage,
  NativeChatQueueItem,
  NativeChatTurn,
  NativeChatTurnRecord,
  NativeChatUpdate,
} from "@grida/desktop-bridge";
import { NativeAgentPane } from "./native-agent-pane";
import "@/app/ui.css";

vi.mock("@/app/(library)/library/attachment", () => ({
  readLibraryAttachment: async () => null,
}));
vi.mock("../shared/agent-library-attachment-picker", () => ({
  AgentLibraryAttachmentPicker: () => null,
}));

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

// Keep retained state across mounts while giving each observer a new attachment.
async function setup(predictPrompt?: DesktopNativeChat["predictPrompt"]) {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await page.viewport(860, 800);
  const chat = crypto.randomUUID();
  const subscribers = new Map<string, (update: NativeChatUpdate) => void>();
  const messages: NativeChatMessage[] = [];
  const turns: NativeChatTurnRecord[] = [];
  const waiting: NativeChatQueueItem[] = [];
  let current: NativeChatTurn | null = null;
  let latest: NativeChatTurn | null = null;
  let revision = 0;
  let admissionPaused = false;
  let hostAvailable = true;
  const retired = new Set<string>();
  const publish = (update: NativeChatUpdate) => {
    for (const receive of subscribers.values()) receive(update);
  };
  const settle = (
    status: "uncertain" | "succeeded" | "cancelled",
    text?: string
  ) => {
    if (!current) throw new Error("fixture_turn_missing");
    const { turnId } = current;
    if (text)
      messages.push({
        messageId: `output-${turnId}`,
        turnId,
        role: "assistant",
        phase: status === "succeeded" ? "answer" : "progress",
        text,
      });
    turns.push({ turnId, status, startedAtMs: 1000, settledAtMs: 2000 });
    latest = {
      ...current,
      disposition: "settled",
      status,
      cancelled: status === "cancelled",
      historyPosition: messages.length,
      journalPosition: 2,
    };
    current = null;
    revision++;
    publish({ kind: "resync" });
    return latest;
  };
  const load = vi.fn<DesktopNativeChat["load"]>(async (sessionId) => ({
    sessionId,
    attachmentId: crypto.randomUUID(),
  }));
  const startTurn = (inputId: string, text: string, inputPosition: number) => {
    const turnId = crypto.randomUUID();
    current = {
      turnId,
      epoch: 1,
      historyPosition: inputPosition,
      journalPosition: 1,
      controlRevision: 0,
      paused: false,
      cancelled: false,
      disposition: "running",
      status: null,
    };
    messages.push({ messageId: inputId, turnId, role: "user", text });
    return turnId;
  };
  const submit = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
    async (action, _attachment, inputId, text) => {
      revision++;
      const inputPosition = messages.length + waiting.length + 1;
      if (action === "enqueue") {
        waiting.push({ inputId, preview: text });
        return {
          sessionId: chat,
          inputId,
          inputPosition,
          turnId: null,
          disposition: "queued",
        };
      }
      const turnId = startTurn(inputId, text, inputPosition);
      return {
        sessionId: chat,
        inputId,
        inputPosition,
        turnId,
        disposition: "claimed",
      };
    }
  );
  const control = vi.fn<DesktopNativeChat["control"]>(async (_, input) => {
    if (input.action !== "stop" || current?.disposition !== "interrupted")
      throw new Error("fixture_expected_stop_of_interrupted_turn");
    admissionPaused = true;
    const turn = settle("cancelled");
    return {
      action: "stop",
      receipt: {
        sessionId: chat,
        turnId: turn.turnId,
        requestId: input.requestId,
        sessionRevision: revision,
        journalPosition: turn.journalPosition,
      },
    };
  });
  const queuePage = () => ({
    items: [...waiting],
    offset: 0,
    previousOffset: null,
    nextOffset: null,
  });
  const bridge: DesktopNativeChat = {
    predictPrompt,
    status: async () => (hostAvailable ? "native-ready" : "native-unavailable"),
    takeNotificationFocus: async () => null,
    inputReceipt: async () => {
      throw new Error("input_unavailable");
    },
    list: async () => ({ sessionIds: [chat], nextCursor: null }),
    create: vi.fn<DesktopNativeChat["create"]>(),
    load,
    detach: async () => {},
    submit: vi.fn<DesktopNativeChat["submit"]>(),
    enqueue: vi.fn<NonNullable<DesktopNativeChat["enqueue"]>>(),
    submitInRegime: submit,
    observe: async (attachment) => {
      if (retired.has(attachment))
        throw new Error("native_chat_attachment_unavailable");
      return {
        observationId: `observation-${revision}`,
        snapshot: {
          sessionId: chat,
          sessionRevision: revision,
          queuedInputs: waiting.length,
          ...(waiting.length > 0 && { queuePreview: queuePage() }),
          admissionPaused,
          current,
          latest,
        },
      };
    },
    transcript: async () => [...messages],
    transcriptPage: async () => ({
      view: 1,
      messages: [...messages],
      turns: [...turns],
      older: null,
    }),
    control,
    queue: async () => queuePage(),
    queuedText: async (_, __, inputId) => {
      const text = waiting.find((item) => item.inputId === inputId)?.preview;
      if (typeof text !== "string") throw new Error("fixture_input_missing");
      return text;
    },
    editQueue: vi.fn<NonNullable<DesktopNativeChat["editQueue"]>>(
      async (_, change) => {
        if (change.action !== "replace" || !admissionPaused)
          throw new Error("fixture_expected_held_queue_edit");
        const index = waiting.findIndex(
          (item) => item.inputId === change.inputId
        );
        if (index === -1) throw new Error("fixture_input_missing");
        waiting[index] = { ...waiting[index], preview: change.text };
        return {
          sessionId: chat,
          requestId: change.requestId,
          sessionRevision: ++revision,
        };
      }
    ),
    subscribe: async (attachment, receive) => {
      subscribers.set(attachment, receive);
      return attachment;
    },
    unsubscribe: async (attachment) => {
      subscribers.delete(attachment);
    },
  };
  const container = document.createElement("section");
  container.className = "flex h-[760px] w-[820px] flex-col bg-background";
  document.body.append(container);
  const mount = async () => {
    act(() => root?.unmount());
    const mounted = createRoot(container);
    root = mounted;
    await act(async () =>
      mounted.render(
        <TooltipProvider>
          <NativeAgentPane
            bridge={bridge}
            initialSession={chat}
            sideChatPlacement={{ present() {}, withdraw() {} }}
          />
        </TooltipProvider>
      )
    );
  };
  const partial = (text: string) => {
    if (!current) throw new Error("fixture_turn_missing");
    publish({
      kind: "text",
      role: "assistant",
      turnId: current.turnId,
      messageId: `output-${current.turnId}`,
      text,
      offsetBytes: 0,
      replace: false,
    });
  };
  const interrupt = () => {
    if (!current) throw new Error("fixture_turn_missing");
    current = { ...current, disposition: "interrupted" };
    revision++;
    publish({ kind: "resync" });
  };
  const loseHost = () => {
    hostAvailable = false;
    for (const attachment of subscribers.keys()) retired.add(attachment);
    subscribers.clear();
  };
  await mount();
  return {
    bridge,
    chat,
    claimNext: () => {
      if (current || admissionPaused) throw new Error("fixture_queue_blocked");
      const input = waiting.shift();
      if (!input?.preview) throw new Error("fixture_queued_text_missing");
      startTurn(input.inputId, input.preview, messages.length + 1);
      revision++;
      publish({ kind: "resync" });
    },
    control,
    interrupt,
    load,
    loseHost,
    mount,
    partial,
    restoreHost: () => {
      hostAvailable = true;
    },
    settle,
    submit,
  };
}

const composer = () =>
  document.querySelector<HTMLElement>(
    '[data-composer-editor][contenteditable="true"]'
  );

async function writeDraft(text: string) {
  await expect.poll(composer).not.toBeNull();
  await act(async () => {
    composer()!.focus();
    await userEvent.keyboard(text);
  });
}

async function send(text: string) {
  await writeDraft(text);
  await act(async () =>
    page.getByRole("button", { name: "Send", exact: true }).click()
  );
  await expect.poll(() => composer()?.textContent).toBe("");
}

it("shows an inline prediction after a reply, then Tab makes it an editable draft until Send", async () => {
  vi.stubGlobal("grida", {
    protocol: 1,
    window: {},
    composerPredictions: {
      get: async () => ({ enabled: true, revision: 1 }),
      onChange: () => () => {},
    },
  });
  const pending = Promise.withResolvers<string | null>();
  const predict = vi.fn<NonNullable<DesktopNativeChat["predictPrompt"]>>(
    () => pending.promise
  );
  const f = await setup(predict);
  const suggestion = "Compare the two <drafts>.";
  await send("Review the two slides.");
  await act(async () =>
    f.settle("succeeded", "The second draft has tighter margins.")
  );
  await expect.poll(() => predict.mock.calls.length).toBe(1);
  await act(async () => pending.resolve(suggestion));
  await expect
    .poll(() =>
      composer()?.querySelector("p")?.getAttribute("data-placeholder")
    )
    .toBe(suggestion);
  expect(composer()?.textContent).toBe("");
  expect(f.submit).toHaveBeenCalledTimes(1);
  await act(async () => {
    composer()!.focus();
    const imeTab = new KeyboardEvent("keydown", {
      key: "Tab",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    expect(composer()!.dispatchEvent(imeTab)).toBe(true);
    expect(composer()?.textContent).toBe("");
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    composer()!.focus();
    await userEvent.keyboard("{Tab}");
  });
  expect(composer()?.textContent).toBe(suggestion);
  expect(document.activeElement).toBe(composer());
  expect(f.submit).toHaveBeenCalledTimes(1);
  await writeDraft(" Use the cover.");
  const edited = suggestion + " Use the cover.";
  expect(composer()?.textContent).toBe(edited);
  await f.mount();
  await expect.poll(() => composer()?.textContent).toBe(edited);
  expect(predict).toHaveBeenCalledTimes(1);
  await act(async () => {
    composer()!.focus();
    await userEvent.keyboard("{Enter}");
  });
  await expect.poll(() => f.submit.mock.calls.at(-1)?.[3]).toBe(edited);
  expect(f.submit).toHaveBeenCalledTimes(2);
});

it("keeps a draft editable while predicting and discards a reply after typing then clearing", async () => {
  vi.stubGlobal("grida", {
    protocol: 1,
    window: {},
    composerPredictions: {
      get: async () => ({ enabled: true, revision: 1 }),
      onChange: () => () => {},
    },
  });
  const pending = Promise.withResolvers<string | null>();
  const predict = vi.fn<NonNullable<DesktopNativeChat["predictPrompt"]>>(
    () => pending.promise
  );
  const f = await setup(predict);
  await send("Review the cover.");
  await act(async () => f.settle("succeeded", "Ready for review."));
  await expect.poll(() => predict.mock.calls.length).toBe(1);
  await writeDraft("x");
  await act(async () => userEvent.keyboard("{Backspace}"));
  await act(async () => pending.resolve("Stale."));
  expect(composer()?.textContent).toBe("");
  expect(composer()?.getAttribute("aria-keyshortcuts")).toBeNull();
  expect(document.querySelector("[data-composer-suggestion]")).toBeNull();
  expect(f.submit).toHaveBeenCalledTimes(1);
});

it.each(["submit", "enqueue"] as const)(
  "clears the composer on the %s receipt while transcript replay is pending",
  async (action) => {
    const f = await setup();
    if (action === "enqueue") {
      await send("Start the review.");
      await expect
        .element(page.getByText("Start the review.", { exact: true }))
        .toBeVisible();
    }
    const text = "Check the margins.";
    await writeDraft(text);
    await expect
      .element(page.getByRole("button", { name: "Send", exact: true }))
      .toBeEnabled();
    const receipt = Promise.withResolvers<void>();
    const replay = Promise.withResolvers<void>();
    const submit = f.submit.getMockImplementation()!;
    f.submit.mockImplementationOnce(async (...args) => {
      await receipt.promise;
      return submit(...args);
    });
    const read = f.bridge.transcriptPage!;
    const transcript = vi
      .spyOn(f.bridge, "transcriptPage")
      .mockImplementationOnce(async (...args) => {
        await replay.promise;
        return read(...args);
      });
    const sending = page.getByRole("button", { name: "Sending…" });
    try {
      await act(async () => userEvent.keyboard("{Enter}"));
      await expect.element(sending).toBeDisabled();
      expect(composer()?.textContent).toBe(text);
      await act(async () => receipt.resolve());
      await expect.poll(() => transcript.mock.calls.length).toBe(1);
      expect(f.submit.mock.lastCall?.[0]).toBe(action);
      await expect.poll(() => composer()?.textContent).toBe("");
      await expect.element(sending).not.toBeInTheDocument();
    } finally {
      receipt.resolve();
      await act(async () => replay.resolve());
    }
  }
);

it("shows a waiting input through automatic handoff while its queue details are delayed", async () => {
  const f = await setup();
  await send("Review the cover.");
  const detail = Promise.withResolvers<void>();
  const readPage = f.bridge.queue!;
  vi.spyOn(f.bridge, "queue").mockImplementation(async (...args) => {
    const page = await readPage(...args);
    await detail.promise;
    return page;
  });
  const text = "Check the margins.";
  const queue = page.getByTestId("native-composer-queue");
  const row = queue.getByText(text, { exact: true });
  const log = page.getByRole("log");
  const message = log.getByText(text, { exact: true });
  try {
    await send(text);
    await expect.element(row, { timeout: 3000 }).toBeVisible();
    await act(async () => f.settle("succeeded", "Cover reviewed."));
    await expect.element(log.getByText("Cover reviewed.")).toBeVisible();
    await expect.element(row).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: /^Resume( queue)?$/ }))
      .not.toBeInTheDocument();

    await act(async () => f.claimNext());
    await expect.element(message).toBeVisible();
  } finally {
    await act(async () => detail.resolve());
  }
  await expect.element(row).not.toBeInTheDocument();
  expect(message.elements()).toHaveLength(1);
  expect(f.submit.mock.calls.map(([action]) => action)).toEqual([
    "submit",
    "enqueue",
  ]);
  expect(f.bridge.editQueue).not.toHaveBeenCalled();
});

it("lets the person reopen an uncertain turn and send one successful follow-up in the same chat", async () => {
  const f = await setup();
  await send("Compare the layouts.");
  await expect
    .element(page.getByText("Compare the layouts.", { exact: true }))
    .toBeVisible();
  await act(async () => f.partial("The first layout uses two columns."));
  await expect
    .element(
      page.getByText("The first layout uses two columns.", { exact: true })
    )
    .toBeVisible();
  await act(async () =>
    f.settle("uncertain", "The first layout uses two columns.")
  );
  const uncertain = page.getByRole("button", { name: /result uncertain/ });
  await expect.element(uncertain).toBeVisible();
  expect(f.submit).toHaveBeenCalledTimes(1);

  await f.mount();
  await expect.element(uncertain).toBeVisible();
  await expect
    .element(page.getByText("Compare the layouts.", { exact: true }))
    .toBeVisible();
  expect(f.load.mock.calls).toEqual([[f.chat], [f.chat]]);
  expect(f.submit).toHaveBeenCalledTimes(1);

  await send("Use the two-column layout.");
  await expect
    .element(page.getByText("Use the two-column layout.", { exact: true }))
    .toBeVisible();
  await act(async () => f.settle("succeeded", "I used the two-column layout."));
  await expect
    .element(page.getByText("I used the two-column layout.", { exact: true }))
    .toBeVisible();
  await expect.element(uncertain).toBeVisible();
  expect(f.submit).toHaveBeenCalledTimes(2);
  const [first, next] = f.submit.mock.calls;
  expect(first[1]).toBe((await f.load.mock.results[0].value).attachmentId);
  expect(next[1]).toBe((await f.load.mock.results[1].value).attachmentId);
  expect(next[2]).not.toBe(first[2]);
  expect((await f.submit.mock.results[1].value).turnId).not.toBe(
    (await f.submit.mock.results[0].value).turnId
  );
  expect(f.bridge.create).not.toHaveBeenCalled();
  expect(f.bridge.control).not.toHaveBeenCalled();
});

it("reconnects the mounted chat after the host returns and keeps its saved history and draft", async () => {
  const f = await setup();
  await send("Compare the layouts.");
  await expect
    .element(page.getByText("Compare the layouts.", { exact: true }))
    .toBeVisible();
  await act(async () => f.settle("succeeded", "Use the two-column layout."));
  const saved = page.getByText("Use the two-column layout.", { exact: true });
  await expect.element(saved).toBeVisible();
  await writeDraft("Keep the margins.");

  await act(async () => {
    f.loseHost();
    window.dispatchEvent(new Event("focus"));
  });
  const reconnect = page.getByRole("button", {
    name: "Reconnect",
    exact: true,
  });
  const sendButton = page.getByRole("button", { name: "Send", exact: true });
  await expect.element(reconnect).toBeVisible();
  await expect.element(sendButton).toBeDisabled();
  await expect.element(saved).toBeVisible();
  expect(composer()?.textContent).toBe("Keep the margins.");
  expect(f.submit).toHaveBeenCalledTimes(1);

  f.restoreHost();
  await act(async () => reconnect.click());
  await expect.element(reconnect).not.toBeInTheDocument();
  await expect.element(sendButton).toBeEnabled();
  await expect.element(saved).toBeVisible();
  expect(composer()?.textContent).toBe("Keep the margins.");
  expect(f.load.mock.calls).toEqual([[f.chat], [f.chat]]);
  expect(f.submit).toHaveBeenCalledTimes(1);
  expect(f.control).not.toHaveBeenCalled();

  await act(async () => sendButton.click());
  await expect.poll(() => composer()?.textContent).toBe("");
  await expect
    .element(page.getByText("Keep the margins.", { exact: true }))
    .toBeVisible();
  await act(async () => f.settle("succeeded", "The margins are unchanged."));
  await expect
    .element(page.getByText("The margins are unchanged.", { exact: true }))
    .toBeVisible();
  expect(f.submit).toHaveBeenCalledTimes(2);
  expect(f.submit.mock.calls[1][1]).toBe(
    (await f.load.mock.results[1].value).attachmentId
  );
});

it("offers an explicit way to end interrupted work while keeping its queue held", async () => {
  const f = await setup();
  await send("Compare the layouts.");
  await expect
    .element(page.getByText("Compare the layouts.", { exact: true }))
    .toBeVisible();
  await send("Check the spacing.");
  await expect
    .element(page.getByText("Check the spacing.", { exact: true }))
    .toBeVisible();
  await act(async () => f.interrupt());

  const end = page.getByRole("button", { name: "End interrupted turn" });
  await expect.element(end).toBeVisible();
  expect(f.control).not.toHaveBeenCalled();
  await act(async () => end.click());
  await expect.element(end).not.toBeInTheDocument();
  await expect
    .element(page.getByText("Queue paused because you interrupted"))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Resume queue", exact: true }))
    .toBeEnabled();
  await expect
    .element(page.getByText("Check the spacing.", { exact: true }))
    .toBeVisible();
  expect(f.control).toHaveBeenCalledExactlyOnceWith(
    (await f.load.mock.results[0].value).attachmentId,
    expect.objectContaining({ action: "stop", observationId: "observation-3" })
  );
  expect(f.submit).toHaveBeenCalledTimes(2);
  expect(f.bridge.editQueue).not.toHaveBeenCalled();

  await send("Keep the margins.");
  await expect
    .element(page.getByText("Keep the margins.", { exact: true }))
    .toBeVisible();
  expect(f.submit).toHaveBeenCalledTimes(3);
  expect(f.submit.mock.calls.map(([action]) => action)).toEqual([
    "submit",
    "enqueue",
    "enqueue",
  ]);
  expect(f.bridge.editQueue).not.toHaveBeenCalled();
});

it("keeps typed queue edits through reconnect and saves them only when asked", async () => {
  const f = await setup();
  const original = "Check the spacing.";
  const edited = `${original} Keep the margins.`;
  const draft = "Later, summarize the changes.";
  await send("Compare the layouts.");
  await send(original);
  await act(async () => f.interrupt());
  const end = page.getByRole("button", { name: "End interrupted turn" });
  await expect.element(end).toBeVisible();
  await act(async () => end.click());
  const queuePaused = page.getByText("Queue paused because you interrupted");
  await expect.element(queuePaused).toBeVisible();
  await writeDraft(draft);

  const more = page.getByRole("button", { name: "More queue actions" });
  const edit = page.getByRole("menuitem", { name: "Edit", exact: true });
  await act(async () => more.click());
  await expect.element(edit).toBeEnabled();
  await act(async () => edit.click());
  await expect.poll(() => composer()?.textContent).toBe(original);
  await act(async () => {
    composer()!.focus();
    await userEvent.keyboard("{End} Keep the margins.");
  });
  await expect.poll(() => composer()?.textContent).toBe(edited);

  await act(async () => {
    f.loseHost();
    window.dispatchEvent(new Event("focus"));
  });
  const save = page.getByRole("button", { name: "Save changes" });
  const reconnect = page.getByRole("button", {
    name: "Reconnect",
    exact: true,
  });
  await expect.element(reconnect).toBeVisible();
  await expect.element(save).toBeDisabled();
  await expect.element(page.getByText(edited, { exact: true })).toBeVisible();
  f.restoreHost();
  await act(async () => reconnect.click());
  await expect.element(reconnect).not.toBeInTheDocument();
  await expect.element(save).toBeEnabled();
  await expect.poll(() => composer()?.textContent).toBe(edited);
  await expect.element(queuePaused).toBeVisible();
  expect(f.bridge.editQueue).not.toHaveBeenCalled();
  expect(f.submit).toHaveBeenCalledTimes(2);

  await act(async () => save.click());
  await expect.element(save).not.toBeInTheDocument();
  await expect.element(page.getByText(edited, { exact: true })).toBeVisible();
  await expect.poll(() => composer()?.textContent).toBe(draft);
  expect(f.bridge.editQueue).toHaveBeenCalledExactlyOnceWith(
    (await f.load.mock.results[1].value).attachmentId,
    expect.objectContaining({
      action: "replace",
      inputId: f.submit.mock.calls[1][2],
      text: edited,
    })
  );
  expect(f.submit).toHaveBeenCalledTimes(2);
});
