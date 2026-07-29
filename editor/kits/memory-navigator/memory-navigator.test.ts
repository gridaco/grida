import { describe, expect, it, vi } from "vitest";
import { MemoryNavigator } from "./memory-navigator";

type Route =
  | Readonly<{ kind: "feed"; query: string }>
  | Readonly<{ kind: "object"; id: string }>;

type EntryState = Readonly<{
  anchorId: string | null;
  scrollTop: number;
}>;

const rootRoute: Route = { kind: "feed", query: "shapes" };
const rootState: EntryState = { anchorId: null, scrollTop: 0 };

function createNavigator(): MemoryNavigator<Route, EntryState> {
  return new MemoryNavigator({
    route: rootRoute,
    state: rootState,
  });
}

describe("MemoryNavigator", () => {
  it("starts at its initial entry without a back destination", () => {
    const navigator = createNavigator();

    expect(navigator.current).toEqual({
      route: rootRoute,
      state: rootState,
    });
    expect(navigator.canGoBack).toBe(false);
    expect(navigator.getSnapshot()).toEqual({
      current: navigator.current,
      canGoBack: false,
    });
  });

  it("pushes a new entry and returns to the previous entry", () => {
    const navigator = createNavigator();
    const objectRoute: Route = { kind: "object", id: "object-1" };
    const objectState: EntryState = {
      anchorId: "object-1",
      scrollTop: 120,
    };

    navigator.push({ route: objectRoute, state: objectState });

    expect(navigator.current).toEqual({
      route: objectRoute,
      state: objectState,
    });
    expect(navigator.canGoBack).toBe(true);
    expect(navigator.back()).toBe(true);
    expect(navigator.current).toEqual({
      route: rootRoute,
      state: rootState,
    });
    expect(navigator.canGoBack).toBe(false);
  });

  it("replaces only the current entry", () => {
    const navigator = createNavigator();
    navigator.push({
      route: { kind: "object", id: "object-1" },
      state: { anchorId: "object-1", scrollTop: 20 },
    });

    navigator.replace({
      route: { kind: "object", id: "object-2" },
      state: { anchorId: "object-2", scrollTop: 40 },
    });

    expect(navigator.current.route).toEqual({
      kind: "object",
      id: "object-2",
    });
    expect(navigator.back()).toBe(true);
    expect(navigator.current.route).toBe(rootRoute);
    expect(navigator.back()).toBe(false);
  });

  it("retains state updates with the entry they update", () => {
    const navigator = createNavigator();
    navigator.updateCurrentState((state) => ({
      ...state,
      anchorId: "object-7",
      scrollTop: 480,
    }));
    navigator.push({
      route: { kind: "object", id: "object-7" },
      state: { anchorId: null, scrollTop: 0 },
    });

    navigator.updateCurrentState((state) => ({
      ...state,
      scrollTop: 720,
    }));
    expect(navigator.current.state.scrollTop).toBe(720);

    navigator.back();
    expect(navigator.current.state).toEqual({
      anchorId: "object-7",
      scrollTop: 480,
    });
  });

  it("publishes stable snapshots after successful mutations", () => {
    const navigator = createNavigator();
    const listener = vi.fn<() => void>();
    const unsubscribe = navigator.subscribe(listener);
    const initialSnapshot = navigator.getSnapshot();

    expect(navigator.getSnapshot()).toBe(initialSnapshot);

    navigator.updateCurrentState((state) => state);
    navigator.replace(navigator.current);
    navigator.back();

    expect(listener).not.toHaveBeenCalled();
    expect(navigator.getSnapshot()).toBe(initialSnapshot);

    navigator.push({
      route: { kind: "object", id: "object-1" },
      state: { anchorId: null, scrollTop: 0 },
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(navigator.getSnapshot()).not.toBe(initialSnapshot);
    expect(navigator.getSnapshot()).toBe(navigator.getSnapshot());

    unsubscribe();
    navigator.back();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("supports passing its subscription methods directly to an edge adapter", () => {
    const navigator = createNavigator();
    const listener = vi.fn<() => void>();
    const subscribe = navigator.subscribe;
    const getSnapshot = navigator.getSnapshot;
    const unsubscribe = subscribe(listener);

    navigator.push({
      route: { kind: "object", id: "object-1" },
      state: { anchorId: null, scrollTop: 0 },
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(getSnapshot()).toBe(navigator.getSnapshot());

    unsubscribe();
  });

  it("rejects navigation from inside a state updater without corrupting history", () => {
    const navigator = createNavigator();

    expect(() =>
      navigator.updateCurrentState((state) => {
        navigator.push({
          route: { kind: "object", id: "reentrant" },
          state,
        });
        return state;
      })
    ).toThrow("cannot navigate from a state updater");

    expect(navigator.current).toEqual({
      route: rootRoute,
      state: rootState,
    });
    expect(navigator.canGoBack).toBe(false);
  });

  it("publishes against a listener snapshot", () => {
    const navigator = createNavigator();
    const listener = vi.fn<() => void>();
    let unsubscribe = () => {};
    unsubscribe = navigator.subscribe(() => {
      listener();
      unsubscribe();
      unsubscribe = navigator.subscribe(listener);
    });

    navigator.push({
      route: { kind: "object", id: "object-1" },
      state: rootState,
    });

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("isolates a failed subscriber from navigation and other subscribers", () => {
    const navigator = createNavigator();
    const error = new Error("subscriber failed");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const listener = vi.fn<() => void>();
    navigator.subscribe(() => {
      throw error;
    });
    navigator.subscribe(listener);

    expect(() =>
      navigator.push({
        route: { kind: "object", id: "object-1" },
        state: rootState,
      })
    ).not.toThrow();
    expect(listener).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      "[MemoryNavigator] subscriber failed",
      error
    );
    expect(navigator.current.route).toEqual({
      kind: "object",
      id: "object-1",
    });

    errorSpy.mockRestore();
  });
});
