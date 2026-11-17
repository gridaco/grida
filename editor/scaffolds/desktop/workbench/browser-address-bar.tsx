"use client";

import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  Clock3Icon,
  GlobeIcon,
  Loader2Icon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { BrowserHistory } from "@/lib/desktop/browser-history";
import { BrowserOmnibox } from "./browser-omnibox";
import type { WorkspaceBrowserTabs } from "./workspace-browser-tabs";

/** Local suggestions share the page's normal DOM stacking; guests stay live. */
export function BrowserAddressBar({
  tabs,
  id,
  url,
  active,
  focusRevision,
  disabled,
  loading,
}: {
  tabs: WorkspaceBrowserTabs;
  id: string;
  url: string | null;
  active: boolean;
  focusRevision: number;
  disabled: boolean;
  loading: boolean;
}) {
  const root = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const controller = useMemo(
    () =>
      new BrowserOmnibox.Controller(url, new BrowserHistory.Controller(), {
        navigate: (value) => tabs.navigate(id, value),
        focusPage: () => tabs.action(id, "focus"),
      }),
    [tabs, id]
  );
  const view = useMemo(() => new BrowserOmnibox.View(controller), [controller]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  useLayoutEffect(
    () =>
      input.current && root.current
        ? view.connect(input.current, root.current)
        : undefined,
    [view]
  );
  useLayoutEffect(
    () => controller.sync(url, active, focusRevision),
    [controller, url, active, focusRevision]
  );
  useLayoutEffect(() => view.sync(state, active), [view, state, active]);
  const open =
    state.expanded &&
    state.focused &&
    active &&
    !disabled &&
    (state.options.length > 0 || state.loading || !!state.error);
  return (
    <form
      ref={root}
      className="relative mx-1 min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        view.submit();
      }}
    >
      <div className="relative flex h-7 min-w-0 items-center rounded-full border bg-muted/40 focus-within:ring-2 focus-within:ring-ring">
        {loading && (
          <Loader2Icon className="pointer-events-none absolute left-2 size-3.5 animate-spin text-muted-foreground" />
        )}
        <input
          ref={input}
          disabled={disabled}
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          role="combobox"
          aria-label="Search or enter URL"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={
            open && state.selected >= 0
              ? `${listId}-${state.selected}`
              : undefined
          }
          placeholder="Search or enter URL"
          value={
            state.focused
              ? state.draft
              : state.draft.replace(/^https?:\/\//i, "")
          }
          onChange={(event) => controller.change(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent px-7 text-center text-xs outline-none focus:text-left"
          style={{
            maskImage: `linear-gradient(to right, ${state.overflow.left ? "transparent 28px, black 40px" : "black 0"}, ${state.overflow.right ? "black calc(100% - 40px), transparent calc(100% - 28px)" : "black 100%"})`,
          }}
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
          <ul
            id={listId}
            role="listbox"
            aria-label="Address suggestions"
            className="max-h-80 overflow-y-auto p-1"
          >
            {state.options.map((option, index) => (
              <li
                key={option.key}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={state.selected === index}
                aria-label={`${option.title}, ${option.detail}`}
                className={`flex min-w-0 items-center gap-2 rounded-lg ${state.selected === index ? "bg-accent text-accent-foreground" : ""}`}
                onPointerMove={() => controller.select(index)}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => view.choose(option)}
                >
                  {option.kind === "search" ? (
                    <SearchIcon className="size-3.5 shrink-0" />
                  ) : option.kind === "history" ? (
                    <Clock3Icon className="size-3.5 shrink-0" />
                  ) : (
                    <GlobeIcon className="size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-xs">
                      {option.title}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {option.detail}
                    </span>
                  </span>
                </button>
                {option.kind === "history" && (
                  <button
                    type="button"
                    aria-label={`Remove ${option.title} from history`}
                    disabled={controller.history
                      .read()
                      .removing.has(option.url)}
                    className="mr-1 rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      view.remove(option.url);
                    }}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {state.loading && (
            <p
              role="status"
              className="px-3 py-2 text-xs text-muted-foreground"
            >
              Searching history…
            </p>
          )}
          {state.error && (
            <p
              role="status"
              className="px-3 py-2 text-xs text-muted-foreground"
            >
              {state.error}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
