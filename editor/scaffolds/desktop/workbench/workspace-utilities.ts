/** The bottom workbench's selected utility and its retained terminal lifetime. */
export class WorkspaceUtilities {
  private view: WorkspaceUtilities.View;
  private readonly listeners = new Set<() => void>();

  constructor(initialTab: WorkspaceUtilities.Tab = "terminal") {
    this.view = Object.freeze({
      mounted: false,
      activeTab: initialTab,
      terminalMounted: false,
    });
  }

  readonly read = (): WorkspaceUtilities.View => this.view;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Selecting Processes never starts a shell; an existing shell stays mounted. */
  show(tab: WorkspaceUtilities.Tab, panel?: WorkspaceUtilities.Panel): void {
    this.update({
      mounted: true,
      activeTab: tab,
      terminalMounted: this.view.terminalMounted || tab === "terminal",
    });
    panel?.expand();
  }

  /** The terminal shortcut selects Terminal before it acts as a visibility toggle. */
  toggleTerminal(panel?: WorkspaceUtilities.Panel): void {
    if (
      !this.view.mounted ||
      this.view.activeTab !== "terminal" ||
      !this.view.terminalMounted
    ) {
      this.show("terminal", panel);
      return;
    }
    this.toggle(panel);
  }

  /** Open the selected utility, or collapse/expand without ending its shell. */
  toggle(panel?: WorkspaceUtilities.Panel): void {
    if (!this.view.mounted) {
      this.show(this.view.activeTab, panel);
      return;
    }
    if (panel?.isCollapsed()) panel.expand();
    else panel?.collapse();
  }

  /** Shell exit does not close the panel or discard the agent's process list. */
  readonly terminalEnded = (): void => {
    this.update({ terminalMounted: false });
  };

  private update(change: Partial<WorkspaceUtilities.View>): void {
    const next = { ...this.view, ...change };
    if (
      next.mounted === this.view.mounted &&
      next.activeTab === this.view.activeTab &&
      next.terminalMounted === this.view.terminalMounted
    )
      return;
    this.view = Object.freeze(next);
    for (const listener of this.listeners) listener();
  }
}

export namespace WorkspaceUtilities {
  export type Tab = "terminal" | "processes";
  export type View = Readonly<{
    mounted: boolean;
    activeTab: Tab;
    terminalMounted: boolean;
  }>;
  /** Resizable-panel adapter: collapsed content remains mounted. */
  export type Panel = {
    isCollapsed(): boolean;
    expand(): void;
    collapse(): void;
  };
}
