import { DesktopBrowser } from "@grida/desktop-bridge";
import { Browser } from "@/lib/desktop/browser";
import { BrowserHistory } from "@/lib/desktop/browser-history";

/** Address input state and DOM interaction; React only paints its snapshot. */
export namespace BrowserOmnibox {
  export type Option = Readonly<{
    kind: "url" | "search" | "history";
    url: string;
    title: string;
    detail: string;
    key: string;
  }>;
  export type State = Readonly<{
    draft: string;
    focused: boolean;
    expanded: boolean;
    composing: boolean;
    options: readonly Option[];
    selected: number;
    loading: boolean;
    error: string | null;
    focusRevision: number;
    selectionRevision: number;
    overflow: Readonly<{ left: boolean; right: boolean }>;
  }>;
  export type Commands = Readonly<{
    navigate(value: string): void;
    focusPage(): void;
  }>;

  export class Controller {
    private state: State;
    private currentUrl: string;
    private typed = false;
    private historyEnabled = true;
    private consumedLocation = 0;
    private listeners = new Set<() => void>();
    private unwatch: () => void;
    constructor(
      url: string | null,
      readonly history: BrowserHistory.Controller,
      private readonly commands: Commands
    ) {
      this.currentUrl = url ?? "";
      this.state = {
        draft: this.currentUrl,
        focused: false,
        expanded: false,
        composing: false,
        options: [],
        selected: -1,
        loading: false,
        error: null,
        focusRevision: 0,
        selectionRevision: 0,
        overflow: { left: false, right: false },
      };
      this.unwatch = history.subscribe(() => this.options());
    }
    readonly read = (): State => this.state;
    readonly subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
    sync(url: string | null, active: boolean, locationRevision: number): void {
      const next = url ?? "";
      if (next !== this.currentUrl) {
        this.currentUrl = next;
        this.patch({ draft: next });
        this.typed = false;
        if (this.state.focused) this.query();
      }
      if (!active) {
        this.cancel();
        return;
      }
      if (locationRevision > this.consumedLocation) {
        this.consumedLocation = locationRevision;
        this.patch({ focusRevision: this.state.focusRevision + 1 });
      }
    }
    focus(): void {
      this.typed = false;
      this.patch({
        focused: true,
        expanded: true,
        selectionRevision: this.state.selectionRevision + 1,
        selected: -1,
      });
      this.query();
    }
    change(value: string): void {
      this.typed = true;
      this.patch({ draft: value, expanded: true, selected: -1 });
      this.query();
    }
    composition(active: boolean): void {
      this.patch({ composing: active });
    }
    blur(): void {
      this.cancel();
    }
    cancel(): void {
      this.history.cancel();
      if (this.state.focused || this.state.expanded || this.state.composing)
        this.patch({
          focused: false,
          expanded: false,
          composing: false,
          selected: -1,
        });
    }
    dispose(): void {
      this.cancel();
      this.unwatch();
      this.history.dispose();
      this.listeners.clear();
    }
    select(index: number): void {
      if (
        index >= 0 &&
        index < this.state.options.length &&
        index !== this.state.selected
      )
        this.patch({ selected: index });
    }
    submit(index?: number): boolean {
      if (this.state.composing) return false;
      const selected = this.state.options[index ?? this.state.selected];
      const destination = Browser.destination(this.state.draft);
      if (selected && this.state.expanded) {
        this.commands.navigate(selected.url);
      } else if (destination) {
        this.commands.navigate(destination.url);
      } else {
        if (this.state.draft.trim()) this.commands.navigate(this.state.draft);
        return false;
      }
      this.cancel();
      return true;
    }
    key(
      key: string,
      composing = false
    ): "submit" | "escape" | "handled" | null {
      if (composing || this.state.composing) return null;
      if (key === "ArrowDown" || key === "ArrowUp") {
        if (!this.state.expanded) {
          this.patch({ expanded: true });
          this.query();
        }
        const count = this.state.options.length;
        if (count)
          this.select(
            this.state.selected < 0
              ? key === "ArrowDown"
                ? 0
                : count - 1
              : (this.state.selected + (key === "ArrowDown" ? 1 : -1) + count) %
                  count
          );
        return "handled";
      }
      if (key === "Enter") return this.submit() ? "submit" : "handled";
      if (key === "Escape") {
        this.patch({ draft: this.currentUrl });
        this.cancel();
        this.commands.focusPage();
        return "escape";
      }
      return null;
    }
    choose(option: Option): boolean {
      if (this.state.composing || !Browser.destination(option.url))
        return false;
      this.commands.navigate(option.url);
      this.cancel();
      return true;
    }
    remove(url: string): void {
      void this.history.remove(url);
    }
    removeSelected(): boolean {
      const option = this.state.options[this.state.selected];
      if (option?.kind !== "history") return false;
      this.remove(option.url);
      return true;
    }
    overflow(left: boolean, right: boolean): void {
      if (
        left !== this.state.overflow.left ||
        right !== this.state.overflow.right
      )
        this.patch({ overflow: { left, right } });
    }
    private query(): void {
      const destination = Browser.destination(this.state.draft);
      const query = this.typed ? this.state.draft : "";
      const transient =
        destination?.kind === "url" &&
        DesktopBrowser.normalizeUrl(destination.url) === null;
      this.historyEnabled =
        !transient &&
        !(this.state.draft.trim() && !destination) &&
        new TextEncoder().encode(query).length <=
          DesktopBrowser.History.MAX_QUERY_BYTES;
      if (!this.historyEnabled) {
        this.history.cancel();
        this.options();
        return;
      }
      if (query !== this.history.read().query) this.history.setQuery(query);
      else void this.history.refresh();
      this.options();
    }
    private options(): void {
      const previous = this.state.options[this.state.selected]?.key;
      const destination = Browser.destination(this.state.draft);
      const options: Option[] = [];
      if (destination) {
        options.push({
          kind: destination.kind,
          url: destination.url,
          title:
            destination.kind === "search"
              ? `Search Google for “${destination.input}”`
              : destination.url,
          detail:
            destination.kind === "search" ? "Google Search" : "Go to address",
          key: `primary:${destination.url}`,
        });
        const search =
          destination.kind === "url" &&
          DesktopBrowser.normalizeUrl(destination.url) !== null
            ? Browser.googleSearch(destination.input)
            : null;
        if (search)
          options.push({
            kind: "search",
            url: search,
            title: `Search Google for “${destination.input}”`,
            detail: "Google Search",
            key: `search:${search}`,
          });
      }
      const history = this.history.read();
      if (this.historyEnabled && (destination || !this.state.draft.trim()))
        for (const entry of history.entries) {
          if (entry.url === destination?.url) continue;
          options.push({
            kind: "history",
            url: entry.url,
            title: entry.title || entry.url,
            detail: entry.url,
            key: `history:${entry.url}`,
          });
        }
      const retained = previous
        ? options.findIndex((option) => option.key === previous)
        : -1;
      this.patch({
        options,
        selected: retained >= 0 ? retained : destination ? 0 : -1,
        loading: this.historyEnabled && history.loading,
        error: this.historyEnabled ? history.error : null,
      });
    }
    private patch(patch: Partial<State>): void {
      this.state = { ...this.state, ...patch };
      for (const listener of this.listeners) listener();
    }
  }

  export class View {
    private input: HTMLInputElement | null = null;
    private container: HTMLElement | null = null;
    private cleanup?: () => void;
    private suppressFocus = false;
    private focusRevision = 0;
    private selectionRevision = 0;
    constructor(private readonly controller: Controller) {}
    connect(input: HTMLInputElement, container: HTMLElement): () => void {
      this.input = input;
      this.container = container;
      const focus = () => {
        if (!this.suppressFocus) this.controller.focus();
      };
      const blur = (event: FocusEvent) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !container.contains(event.relatedTarget)
        )
          this.controller.blur();
      };
      const mouse = (event: MouseEvent) => {
        if (event.button === 0 && input.ownerDocument.activeElement !== input) {
          event.preventDefault();
          input.focus();
        }
      };
      const key = (event: KeyboardEvent) => {
        if (event.target !== input && event.key !== "Escape") return;
        if (
          event.shiftKey &&
          event.key === "Delete" &&
          !event.isComposing &&
          !this.controller.read().composing
        ) {
          if (this.controller.removeSelected()) {
            event.preventDefault();
            return;
          }
        }
        const action = this.controller.key(
          event.key,
          event.isComposing || event.keyCode === 229
        );
        if (action) {
          event.preventDefault();
          event.stopPropagation();
          if (action === "submit" || action === "escape") input.blur();
        }
      };
      const hostWindow = input.ownerDocument.defaultView;
      const windowBlur = () => this.controller.blur();
      const windowFocus = () => {
        if (input.ownerDocument.activeElement === input && !input.disabled)
          this.controller.focus();
      };
      hostWindow?.addEventListener("blur", windowBlur);
      hostWindow?.addEventListener("focus", windowFocus);
      const start = () => this.controller.composition(true);
      const end = () => this.controller.composition(false);
      const update = () => {
        const max = input.scrollWidth - input.clientWidth;
        this.controller.overflow(
          max > 1 && input.scrollLeft > 1,
          max > 1 && input.scrollLeft < max - 1
        );
      };
      const wheel = (event: WheelEvent) => {
        const delta = event.deltaX || event.deltaY;
        if (!delta || event.ctrlKey) return;
        const unit =
          event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? input.clientWidth
              : 1;
        const previous = input.scrollLeft;
        input.scrollLeft += delta * unit;
        if (previous !== input.scrollLeft) {
          event.preventDefault();
          update();
        }
      };
      input.addEventListener("focus", focus);
      container.addEventListener("focusout", blur);
      input.addEventListener("mousedown", mouse);
      container.addEventListener("keydown", key);
      input.addEventListener("compositionstart", start);
      input.addEventListener("compositionend", end);
      input.addEventListener("scroll", update);
      container.addEventListener("wheel", wheel, { passive: false });
      const resize =
        typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(update)
          : null;
      resize?.observe(input);
      update();
      this.cleanup = () => {
        input.removeEventListener("focus", focus);
        container.removeEventListener("focusout", blur);
        input.removeEventListener("mousedown", mouse);
        container.removeEventListener("keydown", key);
        hostWindow?.removeEventListener("blur", windowBlur);
        hostWindow?.removeEventListener("focus", windowFocus);
        input.removeEventListener("compositionstart", start);
        input.removeEventListener("compositionend", end);
        input.removeEventListener("scroll", update);
        container.removeEventListener("wheel", wheel);
        resize?.disconnect();
        this.controller.cancel();
        this.input = null;
        this.container = null;
      };
      return this.cleanup;
    }
    sync(state: State, active: boolean): void {
      const input = this.input;
      if (!input) return;
      if (!active && input.ownerDocument.activeElement === input)
        input
          .closest<HTMLElement>(".grida-content-frame")
          ?.focus({ preventScroll: true });
      if (active && state.focusRevision > this.focusRevision) {
        this.focusRevision = state.focusRevision;
        if (input.ownerDocument.activeElement === input)
          this.controller.focus();
        else input.focus();
      }
      if (state.focused && state.selectionRevision > this.selectionRevision) {
        this.selectionRevision = state.selectionRevision;
        input.setSelectionRange(0, input.value.length, "backward");
        input.scrollLeft = 0;
      }
      const max = input.scrollWidth - input.clientWidth;
      this.controller.overflow(
        max > 1 && input.scrollLeft > 1,
        max > 1 && input.scrollLeft < max - 1
      );
    }
    submit(): void {
      if (this.controller.submit()) this.input?.blur();
    }
    remove(url: string): void {
      if (this.input && this.input.ownerDocument.activeElement !== this.input) {
        this.suppressFocus = true;
        this.input.focus({ preventScroll: true });
        this.suppressFocus = false;
      }
      this.controller.remove(url);
    }
    choose(option: Option): void {
      if (this.controller.choose(option)) this.input?.blur();
    }
  }
}
