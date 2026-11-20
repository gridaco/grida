import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type {
  DesktopNativeChat,
  NativeChatApprovalDecision,
  NativeChatPermissionMode,
} from "@grida/desktop-bridge";
import { NativeChatController } from "@/lib/agent-chat/native-chat-controller";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import type { Workspace } from "@/lib/desktop/bridge";
import { ComposerProvider } from "@/kits/composer";
import { HomeComposer } from "../home/home-composer";
import { AgentComposerInput } from "../shared/agent-composer-input";
import { AgentComposerTools } from "../shared/agent-composer-tools";
import { AgentApprovalPrompt } from "../shared/agent-approval";
import { AgentPermissionConfirmation } from "../shared/agent-permission-confirmation";
import "@/app/ui.css";

const CHAT = "9ecc5ef1-4d6b-4100-ac28-2632ccdc562a";
const resources: { root: Root; controller?: NativeChatController }[] = [];
afterEach(() => {
  for (const { root, controller } of resources.splice(0)) {
    act(() => root.unmount());
    controller?.disconnect();
  }
  document.body.replaceChildren();
});

function Fixture({ controller }: { controller: NativeChatController }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  return (
    <section
      aria-label="Permission fixture"
      className="flex h-72 w-full max-w-[460px] items-end rounded-xl border bg-background p-3"
    >
      <ComposerProvider catalog={{ commands: [], mentions: [] }}>
        <AgentComposerTools
          actions={[]}
          access={{
            mode: state.permissionMode?.mode ?? "restricted",
            available: state.permissionModeAvailable,
            automaticReview:
              state.permissionMode?.available.includes("approve_for_me") ??
              state.draftAutomaticReviewAvailable,
            uncertain: state.permissionModeUncertain,
            busy: state.permissionModeBusy,
            error: state.permissionModeError,
            onRetry: () => void controller.checkPermissionMode(),
            onChange: (mode) => void controller.selectPermissionMode(mode),
          }}
        />
      </ComposerProvider>
      <AgentPermissionConfirmation
        review={state.permissionModeReview}
        onAnswer={(confirmed) =>
          controller.answerPermissionModeReview(confirmed)
        }
      />
    </section>
  );
}

async function setup(
  older = false,
  options: {
    automaticReview?: boolean;
    width?: number;
    height?: number;
    workspaceName?: string;
    chatTitle?: string;
    holdReview?: Promise<void>;
  } = {}
) {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await page.viewport(options.width ?? 720, options.height ?? 720);
  const available: NativeChatPermissionMode[] = options.automaticReview
    ? ["restricted", "approve_for_me", "full_access"]
    : ["restricted", "full_access"];
  const modes = new Map<string, NativeChatPermissionMode>();
  const setPermissionMode = vi.fn<
    NonNullable<DesktopNativeChat["setPermissionMode"]>
  >(async (id, revision, _request, mode, review) => {
    if (review?.confirmed === false) return null;
    modes.set(id, mode);
    return {
      sessionId: id,
      revision: revision + 1,
      mode,
      available,
    };
  });
  const bridge: DesktopNativeChat = {
    status: async () => "native-ready",
    takeNotificationFocus: async () => null,
    inputReceipt: async () => {
      throw new Error("input_unavailable");
    },
    list: async () => ({ sessionIds: [CHAT], nextCursor: null }),
    create: async () => ({ sessionId: CHAT, attachmentId: CHAT }),
    load: async (id) => ({ sessionId: id, attachmentId: id }),
    detach: async () => {},
    submit: vi.fn<DesktopNativeChat["submit"]>(),
    observe: async (id) => ({
      observationId: "observation",
      snapshot: {
        sessionId: id,
        sessionRevision: 0,
        queuedInputs: 0,
        admissionPaused: false,
        current: null,
        latest: null,
      },
    }),
    transcript: async () => [],
    control: vi.fn<DesktopNativeChat["control"]>(),
    subscribe: async () => "subscription",
    unsubscribe: async () => {},
    ...(older
      ? {}
      : {
          acceptsPermissionMode: async () => true,
          permissionMode: async (id: string) => ({
            sessionId: id,
            revision: 0,
            mode: modes.get(id) ?? ("restricted" as const),
            available,
          }),
          reviewPermissionMode: vi.fn<
            NonNullable<DesktopNativeChat["reviewPermissionMode"]>
          >(async () => {
            await options.holdReview;
            return {
              reviewId: "review-token",
              chatTitle: options.chatTitle ?? "Plan the launch",
              workspaceName: options.workspaceName ?? "Studio project",
            };
          }),
          setPermissionMode,
        }),
  };
  const controller = new NativeChatController(bridge);
  controller.connect(CHAT);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  resources.push({ root, controller });
  await act(async () => root.render(<Fixture controller={controller} />));
  await expect.poll(() => controller.read().loading).toBe(false);
  if (!older)
    await expect
      .poll(() => controller.read().permissionModeAvailable)
      .toBe(true);
  return { bridge, controller, modes, setPermissionMode };
}

async function click(name: string | RegExp) {
  await act(async () =>
    page.getByRole("button", { name, exact: typeof name === "string" }).click()
  );
}

async function openReview() {
  await click("Access: Default");
  await click(/^Full access/);
  await expect.element(page.getByRole("alertdialog")).toBeVisible();
  await expect
    .poll(() =>
      document
        .querySelector<HTMLElement>('[role="alertdialog"]')
        ?.getAnimations({ subtree: true })
        .every((animation) => animation.playState !== "running")
    )
    .toBe(true);
  await expect
    .element(page.getByText("Access for new messages"))
    .not.toBeInTheDocument();
}

it("opens the Home dialog on selection before Desktop answers and sends without a second prompt", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await page.viewport(720, 720);
  const composer = new HomeComposer(new ComposerDrafts(null, null));
  const workspace = { id: "studio", name: "Studio project" } as Workspace;
  const pending =
    Promise.withResolvers<
      Awaited<ReturnType<HomeComposer.AccessHost["prepare"]>>
    >();
  const access = {
    prepare: () => pending.promise,
    answer: vi.fn<HomeComposer.AccessHost["answer"]>(async () => {}),
    start: vi.fn<HomeComposer.AccessHost["start"]>(async () => ({
      sessionId: CHAT,
      profileId: null,
    })),
  } satisfies HomeComposer.AccessHost;
  const host = {
    defaultWorkspace: async () => workspace,
    stash: vi.fn<HomeComposer.Host["stash"]>(() => true),
    open: vi.fn<HomeComposer.Host["open"]>(),
  } satisfies HomeComposer.Host;
  function Home() {
    const view = useSyncExternalStore(composer.subscribe, composer.read);
    return (
      <section aria-label="Home" className="mx-auto mt-64 max-w-lg">
        <AgentComposerInput
          catalog={{ commands: [], mentions: [] }}
          awaitSubmission
          isStreaming={false}
          submitting={view.busy}
          canSubmit={!view.busy && !view.permissionBusy}
          onStop={() => {}}
          onSubmit={(text) =>
            composer.submit(
              {
                text,
                prompt: text,
                profileId: null,
                target: null,
                references: [],
              },
              host
            )
          }
          toolbarStart={
            <AgentComposerTools
              actions={[]}
              access={{
                mode: view.permissionMode,
                available: true,
                staged: true,
                busy: view.busy || view.permissionBusy,
                onChange: (mode) =>
                  composer.selectPermissionMode(
                    mode,
                    { workspace, defaultWorkspace: host.defaultWorkspace },
                    access
                  ),
              }}
            />
          }
        />
        <AgentPermissionConfirmation
          review={view.permissionReview}
          onAnswer={composer.answerPermissionReview}
        />
      </section>
    );
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  resources.push({ root });
  await act(async () => root.render(<Home />));
  const input = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  await act(async () => userEvent.fill(input, "First message"));
  await click("Access: Default");
  await click(/^Full access/);
  const dialog = page.getByRole("alertdialog");
  await expect.element(dialog).toHaveAccessibleName("Enable Full access?");
  await expect
    .element(dialog)
    .toHaveTextContent("For this chat in Studio project.");
  expect(host.open).not.toHaveBeenCalled();
  await click("Cancel");
  await expect.element(dialog).not.toBeInTheDocument();
  expect(input.textContent).toBe("First message");
  expect(container.textContent).not.toContain("Couldn't confirm the send");
  expect(host.stash).not.toHaveBeenCalled();
  expect(host.open).not.toHaveBeenCalled();
  expect(access.start).not.toHaveBeenCalled();
  await act(async () =>
    pending.resolve({
      reviewId: "review-token",
      chatTitle: "New chat",
      workspaceName: workspace.name,
    })
  );
  expect(access.answer).toHaveBeenCalledExactlyOnceWith("review-token", false);
  await click("Access: Default");
  await click(/^Full access/);
  await expect.element(dialog).toBeVisible();
  await click("Enable Full access");
  await expect
    .element(
      page.getByRole("button", { name: "Access: Full access", exact: true })
    )
    .toBeEnabled();
  expect(access.start).not.toHaveBeenCalled();
  expect(host.open).not.toHaveBeenCalled();
  await click("Send");
  await expect.element(dialog).not.toBeInTheDocument();
  expect(host.stash).toHaveBeenCalledExactlyOnceWith(
    workspace.id,
    expect.objectContaining({ text: "First message", preparedSessionId: CHAT })
  );
  expect(host.open).toHaveBeenCalledExactlyOnceWith(workspace);
});

it("keeps the picker closed through compact confirmation, cancellation and exact-chat enablement", async () => {
  const f = await setup();
  await openReview();
  const dialog = page.getByRole("alertdialog");
  await expect
    .element(dialog)
    .toHaveTextContent("For this chat in Studio project.");
  await expect.element(dialog).toHaveTextContent("Studio project");
  expect(
    document.querySelector('[role="alertdialog"]')?.textContent
  ).not.toContain(CHAT);
  await page.screenshot({
    path: "../../../../.cache/full-access-confirmation-compact.png",
    element: dialog,
  });
  expect(f.modes.has(CHAT)).toBe(false);
  expect(f.setPermissionMode).not.toHaveBeenCalled();
  const modal = document.querySelector<HTMLElement>('[role="alertdialog"]')!;
  const bounds = modal.getBoundingClientRect();
  console.info("Compact confirmation bounds", {
    width: bounds.width,
    height: bounds.height,
  });
  expect(bounds.width).toBeLessThanOrEqual(384);
  expect(modal.getBoundingClientRect().height).toBeLessThan(430);
  const title = modal.querySelector<HTMLElement>("h2")!;
  const risk = Array.from(modal.querySelectorAll<HTMLElement>("p")).find(
    (node) => node.textContent?.includes("No sandbox or approval prompts.")
  )!;
  expect(parseFloat(getComputedStyle(title).fontSize)).toBeGreaterThan(
    parseFloat(getComputedStyle(risk).fontSize)
  );
  await expect
    .element(page.getByRole("button", { name: "Cancel", exact: true }))
    .toHaveFocus();
  await act(async () => userEvent.keyboard("{Enter}"));
  await expect.element(dialog).not.toBeInTheDocument();
  await expect
    .element(page.getByText("Access for new messages"))
    .not.toBeInTheDocument();
  await expect.poll(() => f.controller.read().permissionModeBusy).toBe(false);
  expect(f.modes.has(CHAT)).toBe(false);
  await openReview();
  await expect
    .element(page.getByRole("button", { name: "Cancel", exact: true }))
    .toHaveFocus();
  await act(async () => userEvent.keyboard("{Tab}"));
  await expect
    .element(
      page.getByRole("button", { name: "Enable Full access", exact: true })
    )
    .toHaveFocus();
  await act(async () => userEvent.keyboard("{Enter}"));
  await expect
    .poll(() => f.controller.read().permissionMode?.mode)
    .toBe("full_access");
  const call = f.setPermissionMode.mock.calls.at(-1)!;
  expect(call[0]).toBe(CHAT);
  expect(call[1]).toBe(0);
  expect(call[3]).toBe("full_access");
  expect(call[4]).toEqual({ reviewId: "review-token", confirmed: true });
  expect(f.bridge.submit).not.toHaveBeenCalled();
});

it("closes the picker immediately before a delayed Full access review and changes nothing yet", async () => {
  const held = Promise.withResolvers<void>();
  const f = await setup(false, { holdReview: held.promise });
  await click("Access: Default");
  await click(/^Full access/);
  await expect
    .element(page.getByText("Access for new messages"))
    .not.toBeInTheDocument();
  expect(f.setPermissionMode).not.toHaveBeenCalled();
  expect(f.modes.has(CHAT)).toBe(false);
  await act(async () => held.resolve());
  await expect.element(page.getByRole("alertdialog")).toBeVisible();
  expect(f.setPermissionMode).not.toHaveBeenCalled();
  await click("Cancel");
});

it("closes the picker when Default is selected and needs no warning confirmation", async () => {
  const f = await setup();
  await openReview();
  await click("Enable Full access");
  await expect
    .poll(() => f.controller.read().permissionMode?.mode)
    .toBe("full_access");
  await click("Access: Full access");
  await click(/^Default/);
  await expect
    .element(page.getByText("Access for new messages"))
    .not.toBeInTheDocument();
  await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
  await expect
    .poll(() => f.controller.read().permissionMode?.mode)
    .toBe("restricted");
  expect(f.setPermissionMode.mock.calls.at(-1)?.[3]).toBe("restricted");
});

it("fits compact confirmation on a narrow screen with long project and chat names", async () => {
  const workspaceName = `Studio ${"ExtremelyLongWorkspaceName".repeat(7)}`;
  const chatTitle =
    "Quarterly illustration and publishing workflow review ".repeat(20);
  const f = await setup(false, {
    width: 375,
    height: 667,
    workspaceName,
    chatTitle,
  });
  await openReview();
  const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain(workspaceName);
  expect(dialog.textContent).not.toContain(chatTitle);
  expect(dialog.textContent).not.toContain(CHAT);
  const bounds = dialog.getBoundingClientRect();
  console.info("Narrow confirmation bounds", {
    width: bounds.width,
    height: bounds.height,
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
  expect(bounds.height).toBeLessThan(430);
  expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth + 1);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    window.innerWidth
  );
  await expect
    .element(page.getByRole("button", { name: "Cancel", exact: true }))
    .toBeVisible();
  await expect
    .element(
      page.getByRole("button", { name: "Enable Full access", exact: true })
    )
    .toBeVisible();
  await page.screenshot({
    path: "../../../../.cache/full-access-confirmation-compact-narrow.png",
    element: page.getByRole("alertdialog"),
  });
  expect(f.setPermissionMode).not.toHaveBeenCalled();
  await click("Cancel");
});

it("closes pending confirmation when another chat takes the view", async () => {
  const f = await setup();
  await openReview();
  await act(async () => f.controller.select("another-chat"));
  await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
  expect(f.bridge.setPermissionMode).not.toHaveBeenCalled();
  expect(f.modes.has(CHAT)).toBe(false);
});

it("selects automatic review for this chat when the host advertises it", async () => {
  const { bridge, setPermissionMode } = await setup(false, {
    automaticReview: true,
  });
  await click("Access: Default");
  await click(/^Approve for me/);
  await expect
    .element(page.getByRole("button", { name: "Access: Approve for me" }))
    .toBeVisible();
  expect(setPermissionMode).toHaveBeenCalledWith(
    CHAT,
    0,
    expect.any(String),
    "approve_for_me",
    undefined
  );
  expect(bridge.reviewPermissionMode).not.toHaveBeenCalled();
});

it("omits automatic review on a two-mode host", async () => {
  await setup();
  await click("Access: Default");
  expect(
    page.getByRole("button", { name: /^Approve for me/ }).elements()
  ).toHaveLength(0);
});

it("keeps Full access disabled on older hosts", async () => {
  await setup(true);
  await page
    .getByRole("button", { name: "Access: Default", exact: true })
    .click();
  await expect
    .element(page.getByRole("button", { name: /^Full access/ }))
    .toBeDisabled();
  await expect
    .element(
      page.getByText(
        "Open a project in a supported Desktop build to choose Full access."
      )
    )
    .toBeVisible();
});

it("shows the exact command and network scope when review times out and accepts a manual decline", async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  resources.push({ root });
  const answer = vi.fn<(decision: NativeChatApprovalDecision) => void>();
  await act(async () =>
    root.render(
      <AgentApprovalPrompt
        approval={{
          reviewId: "review",
          root: "/project",
          tool: "exec_command",
          command: "curl https://example.org",
          cwd: "/project",
          executable: "/bin/sh",
          access: "read",
          network: { host: "example.org", port: 443 },
          scope: {
            diskRead: true,
            resolvedExecutable: "/bin/sh",
            resolvedCwd: "/project",
            readRoots: ["/project"],
            writeRoots: [],
            runtimeRoots: ["/usr/bin"],
            privateTempWrite: true,
            environmentNames: ["PATH"],
          },
          reviewFailure: "timed_out",
        }}
        onDecision={answer}
      />
    )
  );
  await expect
    .element(page.getByText("Automatic review timed out."))
    .toBeVisible();
  await expect
    .element(page.getByText('Destination "example.org" port 443'))
    .toBeVisible();
  await expect
    .element(page.getByText('Command "curl https://example.org"'))
    .toBeVisible();
  await expect
    .element(
      page.getByText(
        "Can read files outside the project, except protected locations."
      )
    )
    .toBeVisible();
  await page.getByRole("button", { name: "Decline" }).click();
  expect(answer).toHaveBeenCalledExactlyOnceWith("decline");
});
