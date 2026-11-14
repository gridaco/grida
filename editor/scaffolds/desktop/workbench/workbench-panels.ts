import type { ReactNode } from "react";
import type { EditorGroup } from "./editor-group";
import { WorkbenchTab } from "./workbench-tab";

/** What a panel tab shows: its strip label and its content. */
export type WorkbenchPanel = Readonly<{
  title: string;
  icon?: ReactNode;
  /** Fills the editor region while the tab is active. */
  content: ReactNode;
}>;

/**
 * The workbench's panel tabs: tabs that are not files.
 *
 * An owner shows a panel by id. The first `show` opens it as a focused tab in
 * the editor group; later calls update its content in place without moving
 * focus. The tab then behaves like any other tab (strip order, activation,
 * the neighbor rule on close), but is never reopenable and never matched by a
 * file rule.
 *
 * Dismissal runs one way. When the tab leaves the group by any workbench
 * gesture (its close button, middle click, the close-active shortcut), the
 * panel is removed and the owner's `dismissed` runs once, so the owner can end
 * what the panel shows. `withdraw` is the owner's own removal and does not
 * call back.
 *
 * Framework-agnostic: React reads it through `subscribe`/`getSnapshot`.
 */
export class WorkbenchPanels {
  private readonly shown = new Map<
    string,
    { panel: WorkbenchPanel; dismissed: () => void }
  >();
  private snapshot: ReadonlyMap<string, WorkbenchPanel> = new Map();
  private readonly listeners = new Set<() => void>();
  private unwatch?: () => void;

  constructor(
    private readonly group: Pick<
      EditorGroup,
      "getSnapshot" | "subscribe" | "open" | "activate" | "closeMatching"
    >
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Shown panels by id; a new identity after every change. */
  getSnapshot = (): ReadonlyMap<string, WorkbenchPanel> => this.snapshot;

  /**
   * Show panel `id`, or update the one shown. A newly shown panel opens as the
   * active tab; `dismissed` replaces the previous callback.
   */
  show(id: string, panel: WorkbenchPanel, dismissed: () => void): void {
    const known = this.shown.has(id);
    this.shown.set(id, { panel, dismissed });
    this.commit();
    if (known) return;
    this.watch();
    this.group.open(WorkbenchTab.panel(id));
  }

  /** Focus a shown panel's tab. */
  reveal(id: string): void {
    if (this.shown.has(id)) this.group.activate(WorkbenchTab.panel(id));
  }

  /** Remove a panel and its tab without calling `dismissed`. */
  withdraw(id: string): void {
    if (!this.shown.delete(id)) return;
    this.commit();
    const key = WorkbenchTab.panel(id);
    this.group.closeMatching((tab) => tab === key);
    this.settle();
  }

  private watch(): void {
    this.unwatch ??= this.group.subscribe(this.reconcile);
  }

  /** Stop observing the group once no panel is shown. */
  private settle(): void {
    if (this.shown.size > 0) return;
    this.unwatch?.();
    this.unwatch = undefined;
  }

  /** A panel whose tab left the group was dismissed there. */
  private readonly reconcile = (): void => {
    const open = new Set(this.group.getSnapshot().tabs);
    const gone = [...this.shown].filter(
      ([id]) => !open.has(WorkbenchTab.panel(id))
    );
    if (gone.length === 0) return;
    for (const [id] of gone) this.shown.delete(id);
    this.commit();
    this.settle();
    for (const [, { dismissed }] of gone) dismissed();
  };

  private commit(): void {
    this.snapshot = new Map(
      [...this.shown].map(([id, { panel }]) => [id, panel])
    );
    for (const listener of this.listeners) listener();
  }
}
