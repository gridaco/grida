import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { usePanelRef } from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@app/ui/components/resizable";
import { terminal, type Workspace } from "@/lib/desktop/bridge";
import type { NativeBackgroundProcessController } from "@/lib/agent-chat/native-background-process-controller";
import { NativeActivityFixtures } from "./native-agent-activity.fixtures";
import { WorkspaceUtilities } from "./workspace-utilities";
import { WorkspaceUtilitiesPanel } from "./workspace-utilities-panel";
import "@/app/ui.css";

const workspace: Workspace = {
  id: "workspace",
  root: "/fixture/workspace",
  name: "Workspace",
  opened_at: 0,
  pinned: false,
};
type Fixture = Awaited<ReturnType<typeof NativeActivityFixtures.create>>;
type TerminalHandlers = Parameters<typeof terminal.create>[1];
const mounted: { root: Root; fixtures: Fixture[] }[] = [];

afterEach(() => {
  for (const { root, fixtures } of mounted.splice(0)) {
    act(() => root.unmount());
    for (const fixture of fixtures) fixture.dispose();
  }
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** Real panel and terminal lifecycle, with synthetic process and PTY bridges. */
function UtilitiesHarness({
  utilities,
  processes,
}: {
  utilities: WorkspaceUtilities;
  processes: NativeBackgroundProcessController | null;
}) {
  const view = useSyncExternalStore(
    utilities.subscribe,
    utilities.read,
    utilities.read
  );
  const panel = usePanelRef();
  return (
    <section aria-label="Fixture workbench" style={{ width: 760, height: 600 }}>
      <div className="flex h-12 items-center gap-3">
        <button
          onClick={() => utilities.toggleTerminal(panel.current ?? undefined)}
        >
          Toggle Terminal
        </button>
        <button onClick={() => utilities.toggle(panel.current ?? undefined)}>
          Toggle workspace utilities
        </button>
        <input aria-label="Parent draft" defaultValue="Unsent parent draft" />
      </div>
      <ResizablePanelGroup orientation="vertical" style={{ height: 552 }}>
        <ResizablePanel minSize="120px">
          <p>Workspace document</p>
        </ResizablePanel>
        {view.mounted && (
          <>
            <ResizableHandle aria-label="Resize workspace utilities" />
            <ResizablePanel
              panelRef={panel}
              collapsible
              minSize="120px"
              defaultSize="55%"
            >
              <WorkspaceUtilitiesPanel
                workspace={workspace}
                utilities={utilities}
                processes={processes}
                supportsTerminal
                onClose={() => panel.current?.collapse()}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </section>
  );
}

async function setup(initialTab: WorkspaceUtilities.Tab = "terminal") {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await page.viewport(800, 650);
  document.body.style.margin = "16px";
  const fixtures = [
    await NativeActivityFixtures.create(),
    await NativeActivityFixtures.create(),
  ];
  const utilities = new WorkspaceUtilities(initialTab);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, fixtures });
  const sessions: { id: string; handlers: TerminalHandlers }[] = [];
  const create = vi
    .spyOn(terminal, "create")
    .mockImplementation(async (_options, handlers) => {
      const session = { id: `fixture-pty-${sessions.length + 1}`, handlers };
      sessions.push(session);
      return { id: session.id };
    });
  const write = vi.spyOn(terminal, "write").mockResolvedValue();
  const resize = vi.spyOn(terminal, "resize").mockResolvedValue();
  const kill = vi.spyOn(terminal, "kill").mockResolvedValue();
  const render = async (processes: NativeBackgroundProcessController | null) =>
    act(async () =>
      root.render(
        <UtilitiesHarness utilities={utilities} processes={processes} />
      )
    );
  await render(fixtures[0].processes);
  return {
    fixtures,
    utilities,
    container,
    root,
    render,
    sessions,
    create,
    write,
    resize,
    kill,
  };
}

async function clickButton(name: string) {
  await act(async () =>
    page.getByRole("button", { name, exact: true }).click()
  );
}

async function selectTab(name: "Terminal" | "Processes") {
  await act(async () => page.getByRole("tab", { name, exact: true }).click());
}

describe("Workspace utilities in Chromium", () => {
  it("opens Processes through Workspace utilities, follows the selected main chat and keeps Stop scopes", async () => {
    const f = await setup("processes");
    await clickButton("Toggle workspace utilities");
    await selectTab("Processes");
    const panel = f.container.querySelector(
      '[data-testid="workspace-utilities-panel"]'
    )!;
    expect(panel.textContent).not.toContain("Selected main chat");
    expect(panel.textContent).toContain("pnpm dev");
    expect(panel.textContent).toContain("pnpm test");
    expect(
      f.container.querySelector('[data-testid="terminal-pane"]')
    ).toBeNull();
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
    expect(f.create).not.toHaveBeenCalled();

    await clickButton("Stop pnpm dev");
    await expect.poll(() => f.fixtures[0].calls.processStop).toEqual([[1]]);
    await expect.poll(() => panel.textContent).toContain("exited 0");
    expect(panel.textContent).not.toContain("Stop all");

    const other = f.fixtures[1];
    other.data.processes = other.data.processes.map((process) => ({
      ...process,
      command: process.processId === 1 ? "other dev server" : "other watcher",
      state: "running",
      exitCode: null,
    }));
    other.processes.receive(other.data.processes);
    await f.render(other.processes);
    expect(panel.textContent).toContain("other dev server");
    expect(panel.textContent).toContain("other watcher");
    expect(panel.textContent).not.toContain("pnpm dev");
    expect(panel.textContent).not.toContain("pnpm test");
    await clickButton("Stop all");
    await expect.poll(() => other.calls.processStop).toEqual([undefined]);
    expect(f.fixtures[0].calls.processStop).toEqual([[1]]);
    await expect.poll(() => other.processes.read().running).toBe(0);
    await f.render(null);
    expect(panel.textContent).toContain("Processes unavailable for this chat.");
    expect(panel.textContent).not.toContain("other watcher");
    expect(f.create).not.toHaveBeenCalled();
  });

  it("retains the same real xterm and PTY through tab changes and actual panel collapse, and kills it on teardown", async () => {
    const f = await setup();
    await clickButton("Toggle Terminal");
    await expect.poll(() => f.create.mock.calls.length).toBe(1);
    const pane = f.container.querySelector('[data-testid="terminal-pane"]')!;
    const xterm = pane.querySelector(".xterm")!;
    expect(xterm).not.toBeNull();
    f.sessions[0].handlers.onData("retained shell output\r\n");
    await expect
      .poll(() => pane.textContent)
      .toContain("retained shell output");
    await selectTab("Processes");
    expect(f.container.querySelector('[data-testid="terminal-pane"]')).toBe(
      pane
    );
    expect(pane.querySelector(".xterm")).toBe(xterm);
    expect(pane.hasAttribute("inert")).toBe(true);
    expect(f.kill).not.toHaveBeenCalled();
    const processFocus = document.activeElement;
    f.sessions[0].handlers.onData("\x1b[6n");
    await expect
      .poll(() =>
        f.write.mock.calls.some(
          ([id, data]) =>
            id === "fixture-pty-1" &&
            data.charCodeAt(0) === 27 &&
            /^\[\d+;\d+R$/.test(data.slice(1))
        )
      )
      .toBe(true);
    expect(document.activeElement).toBe(processFocus);
    await selectTab("Terminal");
    expect(pane.hasAttribute("inert")).toBe(false);
    expect(pane.textContent).toContain("retained shell output");
    await clickButton("Close workspace utilities");
    await expect.poll(() => pane.getBoundingClientRect().height).toBe(0);
    expect(f.container.querySelector('[data-testid="terminal-pane"]')).toBe(
      pane
    );
    expect(f.kill).not.toHaveBeenCalled();
    await clickButton("Toggle Terminal");
    await expect
      .poll(() => pane.getBoundingClientRect().height)
      .toBeGreaterThan(0);
    expect(pane.querySelector(".xterm")).toBe(xterm);
    expect(pane.textContent).toContain("retained shell output");
    expect(f.create).toHaveBeenCalledOnce();
    const entry = mounted.find((entry) => entry.root === f.root)!;
    mounted.splice(mounted.indexOf(entry), 1);
    await act(async () => f.root.unmount());
    for (const fixture of entry.fixtures) fixture.dispose();
    expect(f.kill).toHaveBeenCalledExactlyOnceWith("fixture-pty-1");
    expect(f.fixtures[0].calls.processStop).toEqual([]);
  });

  it("does not let a pending shell creation steal focus after selecting Processes, and keeps Processes after shell exit", async () => {
    const f = await setup();
    let resolveCreate!: (value: { id: string }) => void;
    let handlers!: TerminalHandlers;
    f.create.mockImplementationOnce((_options, next) => {
      handlers = next;
      return new Promise((resolve) => {
        resolveCreate = resolve;
      });
    });
    await clickButton("Toggle Terminal");
    await expect.poll(() => f.create.mock.calls.length).toBe(1);
    await selectTab("Processes");
    const draft = f.container.querySelector<HTMLInputElement>(
      '[aria-label="Parent draft"]'
    )!;
    draft.focus();
    await act(async () => resolveCreate({ id: "pending-pty" }));
    await expect
      .poll(() => f.resize.mock.calls.some(([id]) => id === "pending-pty"))
      .toBe(true);
    expect(document.activeElement).toBe(draft);
    expect(
      f.container
        .querySelector('[data-testid="terminal-pane"]')
        ?.hasAttribute("inert")
    ).toBe(true);
    await act(async () => userEvent.keyboard(" visible parent typing"));
    expect(draft.value).toBe("Unsent parent draft visible parent typing");
    expect(f.write.mock.calls.map(([, data]) => data).join("")).not.toContain(
      "visible parent typing"
    );
    await act(async () => handlers.onExit({ exitCode: 0 }));
    await expect
      .poll(() => f.container.querySelector('[data-testid="terminal-pane"]'))
      .toBeNull();
    expect(f.utilities.read().activeTab).toBe("processes");
    expect(
      f.container.querySelector('[data-testid="workspace-utilities-panel"]')
        ?.textContent
    ).toContain("pnpm dev");
    expect(f.fixtures[0].calls.processStop).toEqual([]);
    expect(f.kill).toHaveBeenCalledExactlyOnceWith("pending-pty");
    expect(f.create).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(draft);
  });

  it("does not let pending terminal creation take focus after the selected Terminal panel collapses", async () => {
    const f = await setup();
    let resolveCreate!: (value: { id: string }) => void;
    f.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );
    await clickButton("Toggle Terminal");
    await expect.poll(() => f.create.mock.calls.length).toBe(1);
    const pane = f.container.querySelector<HTMLElement>(
      '[data-testid="terminal-pane"]'
    )!;
    const inner = pane.querySelector<HTMLElement>(".xterm")!.parentElement!;
    await clickButton("Close workspace utilities");
    await expect.poll(() => pane.getBoundingClientRect().height).toBe(0);
    expect(f.utilities.read().activeTab).toBe("terminal");
    const draft = f.container.querySelector<HTMLInputElement>(
      '[aria-label="Parent draft"]'
    )!;
    draft.focus();
    await act(async () => resolveCreate({ id: "collapsed-pending-pty" }));
    await expect
      .poll(() =>
        f.resize.mock.calls.some(([id]) => id === "collapsed-pending-pty")
      )
      .toBe(true);
    expect(
      document.activeElement,
      JSON.stringify({
        paneHeight: pane.getBoundingClientRect().height,
        paneClientHeight: pane.clientHeight,
        innerHeight: inner.getBoundingClientRect().height,
        innerClientHeight: inner.clientHeight,
      })
    ).toBe(draft);
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.kill).not.toHaveBeenCalled();
  });
});
