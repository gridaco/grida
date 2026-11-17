import type { DesktopBrowser } from "@grida/desktop-bridge";
import type { WorkspaceBrowserTabs } from "./workspace-browser-tabs";

export namespace BrowserGuestMounts {
  export type Commands = Readonly<{
    reserveMount(id: string): Promise<DesktopBrowser.GuestMount | null>;
    setActive(id: string, active: boolean): void;
  }>;
  type Claim = {
    slot: HTMLElement;
    focus: HTMLElement;
    anchor: string;
  };
  export type Record = {
    tabId: string;
    pageId: string;
    wrapper: HTMLElement;
    guest: HTMLElement;
    mounted: boolean;
    active: boolean;
    pending: boolean;
  };
  export type Presentation = {
    entry: WorkspaceBrowserTabs.Entry;
    active: boolean;
  };
  export type State = {
    claim?: Claim;
    presentation?: Presentation;
    record?: Record;
  };
}

/**
 * Owns connected guest nodes for one live shell document. React owns anchors,
 * never these nodes. The fixed anchor layer targets the workbench's non-scrolling
 * content frame; it does not inherit arbitrary ancestor scrollport clipping.
 */
export class BrowserGuestMounts {
  private root: HTMLElement | null = null;
  private readonly states = new Map<string, BrowserGuestMounts.State>();
  private nextAnchor = 0;
  private disposed = false;

  constructor(
    private readonly document: Document,
    private readonly commands: BrowserGuestMounts.Commands
  ) {}

  connect(id: string, slot: HTMLElement, focus: HTMLElement): () => void {
    const state = this.state(id);
    const claim = {
      slot,
      focus,
      anchor: `--grida-browser-${++this.nextAnchor}`,
    };
    state.claim = claim;
    slot.style.setProperty("anchor-name", claim.anchor);
    this.present(state);
    return () => {
      // React's layout-effect cleanup runs before removing the anchor. Missing
      // anchors have a visible CSS fallback, so hiding here is mandatory.
      if (state.claim !== claim) return;
      this.hide(state);
      state.claim = undefined;
      slot.style.removeProperty("anchor-name");
    };
  }

  update(entry: WorkspaceBrowserTabs.Entry, active: boolean): void {
    const state = this.state(entry.id);
    state.presentation = { entry, active };
    this.reconcileRecord(state);
    this.present(state);
  }

  /** Native outcomes also settle nodes while React has no mounted subscriber. */
  reconcile(entries: ReadonlyMap<string, WorkspaceBrowserTabs.Entry>): void {
    for (const [id, state] of this.states) {
      const entry = entries.get(id);
      if (!entry || !entry.page) {
        this.remove(state);
        if (!state.claim) this.states.delete(id);
      } else if (state.presentation) {
        state.presentation = { ...state.presentation, entry };
        this.reconcileRecord(state);
        this.present(state);
      }
    }
  }

  focus(id: string): void {
    const state = this.states.get(id);
    if (state?.record?.active && state.presentation?.entry.page?.mounted)
      state.record.guest.focus();
  }

  hideAll(): void {
    for (const state of this.states.values()) this.hide(state);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const state of this.states.values()) this.remove(state);
    this.states.clear();
    this.root?.remove();
    this.root = null;
  }

  private state(id: string): BrowserGuestMounts.State {
    let state = this.states.get(id);
    if (!state) {
      state = {};
      this.states.set(id, state);
    }
    return state;
  }

  private reconcileRecord(state: BrowserGuestMounts.State): void {
    const page = state.presentation?.entry.page;
    if (
      state.record &&
      (!page ||
        state.record.pageId !== page.id ||
        (state.record.mounted && !page.mounted) ||
        (!page.mounted && page.failure !== null))
    )
      this.remove(state);
    if (state.record && page?.mounted) state.record.mounted = true;
    if (
      this.disposed ||
      state.record ||
      !page ||
      state.presentation?.entry.error ||
      page.failure ||
      page.mounted
    )
      return;
    const wrapper = this.document.createElement("div");
    wrapper.dataset.browserGuest = page.id;
    wrapper.className = "grida-browser-guest";
    wrapper.style.visibility = "hidden";
    wrapper.style.pointerEvents = "none";
    wrapper.inert = true;
    const guest = this.document.createElement("webview");
    guest.setAttribute("aria-label", "Website");
    // Presentation intent only; Main owns popup admission and guest preferences.
    guest.setAttribute("allowpopups", "");
    guest.tabIndex = -1;
    guest.style.cssText = "display:flex;width:100%;height:100%;border:0";
    // No caller partition, preload or webpreferences. Main consumes its issued
    // bootstrap and binds the actual did-attach-webview guest before navigation.
    wrapper.append(guest);
    const record: BrowserGuestMounts.Record = {
      tabId: state.presentation!.entry.id,
      pageId: page.id,
      wrapper,
      guest,
      mounted: false,
      active: false,
      pending: true,
    };
    state.record = record;
    void this.commands.reserveMount(record.tabId).then((mount) => {
      if (this.disposed || state.record !== record) return;
      record.pending = false;
      if (!mount) {
        this.remove(state);
        return;
      }
      // Set exactly once. Even assigning the same webview src reloads its guest.
      guest.setAttribute("src", mount.src);
      this.layer().append(wrapper);
      this.present(state);
    });
  }

  private layer(): HTMLElement {
    if (!this.root) {
      this.root = this.document.createElement("div");
      this.root.dataset.browserGuestLayer = "";
      this.root.style.display = "contents";
      this.document.body.append(this.root);
    }
    return this.root;
  }

  private present(state: BrowserGuestMounts.State): void {
    const { claim, presentation, record } = state;
    const page = presentation?.entry.page;
    const healthy = !!(page?.mounted && page.url && !page.failure);
    const active = !!(
      claim?.slot.isConnected &&
      presentation?.active &&
      presentation.entry.page?.url &&
      !presentation.entry.page.failure &&
      (!presentation.entry.error || healthy) &&
      record
    );
    if (!record) return;
    if (!active || !claim) {
      this.hide(state);
      return;
    }
    record.wrapper.style.setProperty("position-anchor", claim.anchor);
    record.wrapper.style.visibility = "visible";
    record.wrapper.style.pointerEvents = "inherit";
    record.wrapper.inert = false;
    record.guest.tabIndex = 0;
    if (!record.active) {
      record.active = true;
      this.commands.setActive(record.tabId, true);
    }
  }

  private hide(state: BrowserGuestMounts.State): void {
    const record = state.record;
    if (!record) return;
    // Native WC.focus does not clear focus from the guest DOM. Focus an actual
    // shell element before CSS hiding, then Main gates any queued guest input.
    if (this.document.activeElement === record.guest)
      state.claim?.focus.focus({ preventScroll: true });
    record.wrapper.style.visibility = "hidden";
    record.wrapper.style.pointerEvents = "none";
    record.wrapper.inert = true;
    record.guest.tabIndex = -1;
    if (record.active) {
      record.active = false;
      this.commands.setActive(record.tabId, false);
    }
  }

  private remove(state: BrowserGuestMounts.State): void {
    this.hide(state);
    state.record?.wrapper.remove();
    state.record = undefined;
  }
}
