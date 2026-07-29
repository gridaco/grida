import { MemoryNavigator } from "@/kits/memory-navigator";

export type LibraryExplorerItem = Readonly<{
  id: string;
  title: string;
  url: string;
  width?: number;
  height?: number;
  mime?: string;
}>;

export type LibraryExplorerSource =
  | Readonly<{ kind: "browse" }>
  | Readonly<{ kind: "search"; query: string }>
  | Readonly<{ kind: "similar"; objectId: string }>;

export type LibraryExplorerPage = Readonly<{
  items: LibraryExplorerItem[];
  /** Only an exact terminal bound belongs here. Estimates must stay undefined. */
  exactCount: number | undefined;
}>;

export type LibraryExplorerPageLoader = (
  source: LibraryExplorerSource,
  range: [number, number]
) => Promise<LibraryExplorerPage>;

export type LibraryExplorerScroll = Readonly<{
  scrollTop: number;
  anchorId: string | null;
  anchorOffset: number;
}>;

export type LibraryExplorerRoute =
  | Readonly<{
      kind: "feed";
      source: LibraryExplorerSource;
    }>
  | Readonly<{
      kind: "object";
      object: LibraryExplorerItem;
      source: Readonly<{ kind: "similar"; objectId: string }>;
    }>;

type LoadPhase = "idle" | "loading" | "ready" | "error";

export type LibraryExplorerEntryState = Readonly<{
  items: LibraryExplorerItem[];
  exactCount: number | undefined;
  exhausted: boolean;
  phase: LoadPhase;
  loadingMore: boolean;
  activeLoad: number | null;
  failedLoad: Readonly<{
    range: [number, number];
    append: boolean;
  }> | null;
  scroll: LibraryExplorerScroll;
  focusId: string | null;
}>;

export type LibraryExplorerLoadTicket = Readonly<{
  route: LibraryExplorerRoute;
  source: LibraryExplorerSource;
  range: [number, number];
  append: boolean;
  request: number;
}>;

const EMPTY_SCROLL: LibraryExplorerScroll = {
  scrollTop: 0,
  anchorId: null,
  anchorOffset: 0,
};

function createState(scroll: LibraryExplorerScroll): LibraryExplorerEntryState {
  return {
    items: [],
    exactCount: undefined,
    exhausted: false,
    phase: "idle",
    loadingMore: false,
    activeLoad: null,
    failedLoad: null,
    scroll,
    focusId: null,
  };
}

function sourceOf(route: LibraryExplorerRoute): LibraryExplorerSource {
  return route.source;
}

/**
 * Library-specific navigation and page state.
 *
 * React only subscribes and renders. This class owns nested object navigation,
 * per-entry result caches, stale-request rejection, and the scroll/focus state
 * that must survive a Back operation.
 */
export class LibraryExplorer {
  readonly #navigator: MemoryNavigator<
    LibraryExplorerRoute,
    LibraryExplorerEntryState
  >;
  #request = 0;

  constructor(initialSource: LibraryExplorerSource) {
    this.#navigator = new MemoryNavigator({
      route: { kind: "feed", source: initialSource },
      state: createState(EMPTY_SCROLL),
    });
  }

  readonly subscribe = (listener: () => void): (() => void) =>
    this.#navigator.subscribe(listener);

  readonly getSnapshot = () => this.#navigator.getSnapshot();

  open(
    object: LibraryExplorerItem,
    currentScroll: LibraryExplorerScroll,
    nextScrollTop: number
  ): void {
    const currentRoute = this.#navigator.current.route;
    if (
      currentRoute.kind === "object" &&
      currentRoute.object.id === object.id
    ) {
      return;
    }

    this.#navigator.updateCurrentState((state) => ({
      ...state,
      scroll: currentScroll,
      focusId: object.id,
      // Requests are deliberately current-entry-only. If a page settles while
      // its entry is hidden, it is rejected; clear the marker now so Back can
      // retry rather than restoring a permanent loading state.
      loadingMore: false,
      activeLoad: null,
      phase: state.phase === "loading" ? "idle" : state.phase,
    }));
    this.#navigator.push({
      route: {
        kind: "object",
        object,
        source: { kind: "similar", objectId: object.id },
      },
      state: createState({
        scrollTop: nextScrollTop,
        anchorId: null,
        anchorOffset: 0,
      }),
    });
  }

  back(currentScroll: LibraryExplorerScroll): boolean {
    if (!this.#navigator.canGoBack) return false;
    this.#navigator.updateCurrentState((state) => ({
      ...state,
      scroll: currentScroll,
    }));
    return this.#navigator.back();
  }

  startLoad(
    startIndex: number,
    stopIndex: number,
    append: boolean
  ): LibraryExplorerLoadTicket | null {
    if (stopIndex < startIndex) {
      throw new RangeError(
        `Library page stop (${stopIndex}) precedes start (${startIndex}).`
      );
    }
    const { route, state } = this.#navigator.current;
    if (state.activeLoad !== null || state.exhausted) return null;

    const request = ++this.#request;
    this.#navigator.updateCurrentState((current) => ({
      ...current,
      phase: append ? current.phase : "loading",
      loadingMore: append,
      activeLoad: request,
      failedLoad: null,
    }));

    return {
      route,
      source: sourceOf(route),
      range: [startIndex, stopIndex],
      append,
      request,
    };
  }

  finishLoad(
    ticket: LibraryExplorerLoadTicket,
    page: LibraryExplorerPage
  ): boolean {
    if (!this.#accepts(ticket)) return false;

    this.#navigator.updateCurrentState((state) => {
      const items = ticket.append
        ? LibraryExplorer.merge(state.items, page.items)
        : LibraryExplorer.merge([], page.items);
      const requested = ticket.range[1] - ticket.range[0] + 1;
      const exactCount = page.exactCount ?? state.exactCount;
      return {
        ...state,
        items,
        exactCount,
        exhausted:
          page.items.length < requested ||
          (exactCount !== undefined && items.length >= exactCount),
        phase: "ready",
        loadingMore: false,
        activeLoad: null,
        failedLoad: null,
      };
    });
    return true;
  }

  failLoad(ticket: LibraryExplorerLoadTicket): boolean {
    if (!this.#accepts(ticket)) return false;

    this.#navigator.updateCurrentState((state) => ({
      ...state,
      phase: ticket.append ? "ready" : "error",
      loadingMore: false,
      activeLoad: null,
      failedLoad: {
        range: ticket.range,
        append: ticket.append,
      },
    }));
    return true;
  }

  retryLoad(): LibraryExplorerLoadTicket | null {
    const failed = this.#navigator.current.state.failedLoad;
    if (!failed) return null;
    return this.startLoad(failed.range[0], failed.range[1], failed.append);
  }

  static merge(
    current: LibraryExplorerItem[],
    incoming: LibraryExplorerItem[]
  ): LibraryExplorerItem[] {
    const seen = new Set(current.map((item) => item.id));
    return [
      ...current,
      ...incoming.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }),
    ];
  }

  #accepts(ticket: LibraryExplorerLoadTicket): boolean {
    const { route, state } = this.#navigator.current;
    return route === ticket.route && state.activeLoad === ticket.request;
  }
}
