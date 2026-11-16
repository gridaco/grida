import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { Workspace } from "@/lib/desktop/bridge";
import { NativeBackgroundProcessController } from "@/lib/agent-chat/native-background-process-controller";
import { WorkspaceUtilities } from "./workspace-utilities";
import { WorkspaceUtilitiesPanel } from "./workspace-utilities-panel";

const workspace: Workspace = {
  id: "workspace",
  root: "/fixture/workspace",
  name: "Workspace",
  opened_at: 0,
  pinned: false,
};
const controllers: NativeBackgroundProcessController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

function processes() {
  const controller = new NativeBackgroundProcessController(
    {
      acceptsBackgroundProcesses: async () => true,
      backgroundProcesses: async () => [],
      stopBackgroundProcesses: async () => [],
    },
    "selected-chat"
  );
  controllers.push(controller);
  controller.receive([
    {
      processId: 1,
      command: "pnpm dev",
      cwd: workspace.root,
      terminal: false,
      startedAt: 0,
      state: "running",
      exitCode: null,
    },
    {
      processId: 2,
      command: "pnpm test",
      cwd: workspace.root,
      terminal: false,
      startedAt: 0,
      state: "ended",
      exitCode: 0,
    },
  ]);
  return controller;
}

describe("WorkspaceUtilitiesPanel", () => {
  it("shows both tabs and the selected main chat's live and ended processes without mounting Terminal", () => {
    const utilities = new WorkspaceUtilities();
    utilities.show("processes");
    const html = renderToStaticMarkup(
      <WorkspaceUtilitiesPanel
        workspace={workspace}
        utilities={utilities}
        processes={processes()}
        supportsTerminal
        onClose={() => {}}
      />
    );
    expect(html).toContain('aria-label="Workspace utilities"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Terminal");
    expect(html).toContain("Processes");
    expect(html).not.toContain("Selected main chat");
    expect(html).toContain("pnpm dev");
    expect(html).toContain("pnpm test");
    expect(html).toContain("Stop all");
    expect(html).toContain("exited 0");
    expect(html).not.toContain('data-testid="terminal-pane"');
  });

  it("keeps an existing terminal in the inactive, inert tab without a second terminal header", () => {
    const utilities = new WorkspaceUtilities();
    utilities.show("terminal");
    utilities.show("processes");
    const html = renderToStaticMarkup(
      <WorkspaceUtilitiesPanel
        workspace={workspace}
        utilities={utilities}
        processes={null}
        supportsTerminal
        onClose={() => {}}
      />
    );
    expect(html).toContain('data-testid="terminal-pane"');
    expect(html).toContain('inert=""');
    expect(html).not.toContain('aria-label="Close terminal"');
    expect(html).toContain('aria-label="Close workspace utilities"');
  });

  it("states when selected-chat processes are unavailable instead of showing another chat's list", () => {
    const utilities = new WorkspaceUtilities("processes");
    utilities.show("processes");
    const html = renderToStaticMarkup(
      <WorkspaceUtilitiesPanel
        workspace={workspace}
        utilities={utilities}
        processes={null}
        supportsTerminal={false}
        onClose={() => {}}
      />
    );
    expect(html).toContain("Processes unavailable for this chat.");
    expect(html).not.toContain("No processes yet.");
    expect(html).not.toContain('data-testid="terminal-pane"');
  });
});
