import { describe, expect, it, vi } from "vitest";
import { WorkspaceUtilities } from "./workspace-utilities";

function panel() {
  let collapsed = false;
  return {
    isCollapsed: () => collapsed,
    expand: vi.fn<() => void>(() => {
      collapsed = false;
    }),
    collapse: vi.fn<() => void>(() => {
      collapsed = true;
    }),
  };
}

describe("WorkspaceUtilities", () => {
  it("opens Processes without creating a terminal lifetime", () => {
    const utilities = new WorkspaceUtilities();
    expect(utilities.read().mounted).toBe(false);
    utilities.show("processes");
    expect(utilities.read()).toEqual({
      mounted: true,
      activeTab: "processes",
      terminalMounted: false,
    });
  });

  it("keeps the terminal mounted while selecting Processes and collapsing the panel", () => {
    const utilities = new WorkspaceUtilities();
    const resize = panel();
    utilities.show("terminal");
    utilities.show("processes", resize);
    const beforeCollapse = utilities.read();
    utilities.toggle(resize);
    expect(resize.isCollapsed()).toBe(true);
    expect(utilities.read()).toBe(beforeCollapse);
    expect(utilities.read().terminalMounted).toBe(true);
    utilities.toggle(resize);
    expect(resize.isCollapsed()).toBe(false);
    expect(utilities.read()).toBe(beforeCollapse);
  });

  it("uses the terminal shortcut to reveal Terminal before collapsing it", () => {
    const utilities = new WorkspaceUtilities();
    const resize = panel();
    utilities.show("processes");
    utilities.toggleTerminal(resize);
    expect(utilities.read()).toEqual({
      mounted: true,
      activeTab: "terminal",
      terminalMounted: true,
    });
    expect(resize.collapse).not.toHaveBeenCalled();
    expect(resize.expand).toHaveBeenCalledOnce();
    utilities.toggleTerminal(resize);
    expect(resize.isCollapsed()).toBe(true);
    utilities.toggleTerminal(resize);
    expect(resize.isCollapsed()).toBe(false);
  });

  it("reveals Terminal from Processes even when the bottom panel was collapsed", () => {
    const utilities = new WorkspaceUtilities();
    const resize = panel();
    utilities.show("processes");
    utilities.toggle(resize);
    utilities.toggleTerminal(resize);
    expect(resize.isCollapsed()).toBe(false);
    expect(utilities.read().activeTab).toBe("terminal");
    expect(utilities.read().terminalMounted).toBe(true);
  });

  it("keeps Processes selected after the hidden shell exits and starts a new shell only on request", () => {
    const utilities = new WorkspaceUtilities();
    utilities.show("terminal");
    utilities.show("processes");
    utilities.terminalEnded();
    expect(utilities.read()).toEqual({
      mounted: true,
      activeTab: "processes",
      terminalMounted: false,
    });
    utilities.show("processes");
    expect(utilities.read().terminalMounted).toBe(false);
    utilities.show("terminal");
    expect(utilities.read().terminalMounted).toBe(true);
  });

  it("restarts an exited active shell from the terminal shortcut", () => {
    const utilities = new WorkspaceUtilities();
    const resize = panel();
    utilities.toggleTerminal();
    utilities.terminalEnded();
    utilities.toggleTerminal(resize);
    expect(utilities.read().terminalMounted).toBe(true);
    expect(resize.expand).toHaveBeenCalledOnce();
    expect(resize.collapse).not.toHaveBeenCalled();
  });

  it("opens Processes by default on a host without a terminal", () => {
    const utilities = new WorkspaceUtilities("processes");
    utilities.toggle();
    expect(utilities.read()).toEqual({
      mounted: true,
      activeTab: "processes",
      terminalMounted: false,
    });
  });

  it("publishes changes once and supports subscription cleanup", () => {
    const utilities = new WorkspaceUtilities();
    const changed = vi.fn<() => void>();
    const unsubscribe = utilities.subscribe(changed);
    utilities.show("processes");
    utilities.show("processes");
    utilities.terminalEnded();
    expect(changed).toHaveBeenCalledOnce();
    unsubscribe();
    utilities.show("terminal");
    expect(changed).toHaveBeenCalledOnce();
  });
});
