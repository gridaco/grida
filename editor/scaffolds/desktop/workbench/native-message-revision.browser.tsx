import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type {
  DesktopNativeChat,
  NativeChatMessage,
  NativeChatRevisionReceipt,
} from "@grida/desktop-bridge";
import { NativeAgentPane } from "./native-agent-pane";
import "@/app/ui.css";

// Next server actions and the unused Library picker are outside this fixture.
vi.mock("@/app/(library)/library/attachment", () => ({
  readLibraryAttachment: async () => null,
}));
vi.mock("../shared/agent-library-attachment-picker", () => ({
  AgentLibraryAttachmentPicker: () => null,
}));

const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

async function setup() {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await page.viewport(860, 800);
  const chat = crypto.randomUUID();
  let revision = 1;
  let messages: NativeChatMessage[] = [
    { messageId: "original-user", role: "user", text: "Original request" },
    {
      messageId: "original-answer",
      role: "assistant",
      text: "Original answer",
    },
  ];
  const receipt: NativeChatRevisionReceipt = {
    sessionId: chat,
    view: 2,
    inputId: "revised-user",
    inputPosition: 3,
  };
  const revise = vi.fn<NonNullable<DesktopNativeChat["revise"]>>(
    async () => receipt
  );
  const bridge: DesktopNativeChat = {
    status: async () => "native-ready",
    takeNotificationFocus: async () => null,
    inputReceipt: async () => {
      throw new Error("input_unavailable");
    },
    list: async () => ({ sessionIds: [chat], nextCursor: null }),
    create: async () => ({ sessionId: chat, attachmentId: chat }),
    load: async (id) => ({ sessionId: id, attachmentId: id }),
    detach: async () => {},
    submit: vi.fn<DesktopNativeChat["submit"]>(),
    observe: async (id) => ({
      observationId: `revision-observation-${revision}`,
      snapshot: {
        sessionId: id,
        sessionRevision: revision,
        queuedInputs: 0,
        admissionPaused: false,
        current: null,
        latest:
          revision > 1
            ? {
                turnId: "accepted-revision-turn",
                epoch: 1,
                historyPosition: 3,
                journalPosition: 3,
                controlRevision: 0,
                paused: false,
                cancelled: false,
                disposition: "settled",
                status: "succeeded",
              }
            : null,
        historyRevisionAvailable: true,
      },
    }),
    transcript: async () => messages,
    control: vi.fn<DesktopNativeChat["control"]>(),
    subscribe: async () => "subscription",
    unsubscribe: async () => {},
    prepareRevision: vi.fn<NonNullable<DesktopNativeChat["prepareRevision"]>>(
      async (_attachment, _observation, messageId) => ({
        reviewId: "exact-review",
        messageId,
        text: "Original request",
        subsequentMessages: 1,
      })
    ),
    revise,
  };
  const container = document.createElement("section");
  container.className = "flex h-[760px] w-[820px] flex-col bg-background";
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <NativeAgentPane
        bridge={bridge}
        initialSession={chat}
        sideChatPlacement={{ present() {}, withdraw() {} }}
      />
    )
  );
  await expect
    .element(page.getByText("Original request", { exact: true }))
    .toBeVisible();
  await expect
    .poll(() => container.querySelector('[contenteditable="true"]'))
    .not.toBeNull();
  const composer = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  await act(async () => userEvent.fill(composer, "Unsent composer draft"));
  return {
    bridge,
    revise,
    container,
    composer,
    receipt,
    replaceTranscript(text: string) {
      revision++;
      messages = [{ messageId: "revised-user", role: "user", text }];
    },
  };
}

async function click(name: string) {
  await act(async () =>
    page.getByRole("button", { name, exact: true }).click()
  );
}

async function openEdit() {
  await page.getByText("Original request", { exact: true }).hover();
  await click("Edit and resubmit");
  await expect
    .element(page.getByRole("textbox", { name: "Replacement message" }))
    .toBeVisible();
}

describe("Native message inline revision", () => {
  it("edits the original bubble and Cancel leaves the composer draft intact", async () => {
    const f = await setup();
    await openEdit();
    const form = f.container.querySelector(
      '[data-testid="chat-message-editor"]'
    )!;
    expect(form.closest('[role="log"]')).not.toBeNull();
    expect(f.container.textContent).toContain("Original answer");
    await act(async () =>
      page
        .getByRole("textbox", { name: "Replacement message" })
        .fill("Changed request\nSecond line")
    );
    expect(f.composer.textContent).toBe("Unsent composer draft");
    await click("Cancel");
    await expect
      .element(page.getByText("Original request", { exact: true }))
      .toBeVisible();
    expect(
      f.container.querySelector('[data-testid="chat-message-editor"]')
    ).toBeNull();
    expect(f.composer.textContent).toBe("Unsent composer draft");
    expect(f.revise).not.toHaveBeenCalled();
  });

  it("keeps receipt recovery inline after the accepted edit replaces its original message", async () => {
    const f = await setup();
    const pending = Promise.withResolvers<NativeChatRevisionReceipt>();
    f.revise.mockImplementationOnce(() => pending.promise);
    await openEdit();
    await act(async () =>
      page
        .getByRole("textbox", { name: "Replacement message" })
        .fill("Changed request\nSecond line")
    );
    await act(async () =>
      page
        .getByTestId("chat-message-editor")
        .getByRole("button", { name: "Send", exact: true })
        .click()
    );
    await expect
      .element(page.getByRole("button", { name: "Sending…", exact: true }))
      .toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: "Cancel", exact: true }))
      .toBeDisabled();
    expect(
      f.container.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Replacement message"]'
      )!.readOnly
    ).toBe(true);
    f.replaceTranscript("Accepted changed request");
    await act(async () =>
      pending.reject(new Error("native_chat_revision_unverified"))
    );
    await expect
      .element(page.getByText("Accepted changed request", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Retry edit", exact: true }))
      .toBeEnabled();
    const form = f.container.querySelector(
      '[data-testid="chat-message-editor"]'
    )!;
    expect(form.closest('[role="log"]')).not.toBeNull();
    expect(
      f.container.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Replacement message"]'
      )!.value
    ).toBe("Changed request\nSecond line");
    expect(
      f.container.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Replacement message"]'
      )!.readOnly
    ).toBe(true);
    await expect
      .element(page.getByRole("button", { name: "Cancel", exact: true }))
      .toBeDisabled();
    expect(f.composer.textContent).toBe("Unsent composer draft");
    await click("Retry edit");
    await expect
      .poll(() =>
        f.container.querySelector('[data-testid="chat-message-editor"]')
      )
      .toBeNull();
    expect(f.revise).toHaveBeenCalledTimes(2);
    expect(f.revise.mock.calls[1]).toEqual(f.revise.mock.calls[0]);
    expect(f.composer.textContent).toBe("Unsent composer draft");
    expect(f.bridge.submit).not.toHaveBeenCalled();
  });
});
