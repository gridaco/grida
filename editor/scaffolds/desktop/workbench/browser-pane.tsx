"use client";

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  useRef,
  useState,
} from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  GlobeIcon,
  RotateCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import type { WorkspaceBrowserTabs } from "./workspace-browser-tabs";
import { BrowserAddressBar } from "./browser-address-bar";
import { BrowserFindBar } from "./browser-find-bar";

/** Browser chrome and guest compose through the ordinary workbench DOM. */
export function BrowserPane({
  tabs,
  entry,
  active,
}: {
  tabs: WorkspaceBrowserTabs;
  entry: WorkspaceBrowserTabs.Entry;
  active: boolean;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const controls = useMemo(() => tabs.controls(entry.id), [tabs, entry.id]);
  const controlState = useSyncExternalStore(
    controls.subscribe,
    controls.read,
    controls.read
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const state = tabs.getSnapshot();
  const available = state.supported && !state.error;
  const page = entry.page;
  const healthy = !!(page?.mounted && page.url && !page.failure);
  const failure = page?.failure?.message ?? (!healthy ? entry.error : null);
  const actionError = healthy ? entry.error : null;
  const currentUrl = page?.url ?? entry.url;

  useLayoutEffect(
    () =>
      slot.current
        ? tabs.mounts?.connect(
            entry.id,
            slot.current,
            slot.current.closest<HTMLElement>(".grida-content-frame") ??
              slot.current
          )
        : undefined,
    [tabs, entry.id]
  );
  useLayoutEffect(
    () => tabs.mounts?.update(entry, active),
    [tabs, entry, active]
  );
  useEffect(() => {
    if (!active) setMenuOpen(false);
  }, [active]);

  return (
    <section
      data-testid="workspace-browser"
      aria-label="Browser"
      aria-hidden={!active}
      className={cn(
        "absolute inset-0 flex min-h-0 flex-col overflow-hidden",
        !active && "invisible pointer-events-none"
      )}
    >
      <div className="desktop-no-drag flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <BrowserButton
          label="Back"
          disabled={!page?.canGoBack}
          onClick={() => tabs.action(entry.id, "back")}
        >
          <ArrowLeftIcon />
        </BrowserButton>
        <BrowserButton
          label="Forward"
          disabled={!page?.canGoForward}
          onClick={() => tabs.action(entry.id, "forward")}
        >
          <ArrowRightIcon />
        </BrowserButton>
        <BrowserButton
          label={page?.loading ? "Stop loading" : "Reload page"}
          disabled={!available || (!page && !entry.error)}
          onClick={() =>
            tabs.action(entry.id, page?.loading ? "stop" : "reload")
          }
        >
          {page?.loading ? <XIcon /> : <RotateCwIcon />}
        </BrowserButton>
        <BrowserAddressBar
          tabs={tabs}
          id={entry.id}
          url={currentUrl ?? null}
          active={active}
          focusRevision={entry.locationRevision}
          disabled={!available}
          loading={!!page?.loading}
        />
        <DropdownMenu
          open={active && menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (open) void controls.refreshZoom();
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Browser options"
              title="Browser options"
              className="size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <EllipsisIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (!active || controls.read().findOpen) event.preventDefault();
            }}
          >
            {controlState.supported && (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    controls.openFind();
                  }}
                >
                  Find in page…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void controls.zoom("out")}>
                  Zoom out
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void controls.zoom("reset")}>
                  Actual size ({Math.round(controlState.zoom * 100)}%)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void controls.zoom("in")}>
                  Zoom in
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void controls.print()}>
                  Print…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void controls.inspect()}>
                  Inspect page
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              disabled={!page?.url || !/^https?:\/\//i.test(page.url)}
              onSelect={() => tabs.action(entry.id, "openExternal")}
            >
              <ExternalLinkIcon />
              Open in default browser
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!available}
              onSelect={() => void tabs.clearBrowsingData()}
            >
              <Trash2Icon />
              Clear browsing data…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <BrowserFindBar
        controls={controls}
        state={controlState}
        focusPage={() => tabs.action(entry.id, "focus")}
      />
      {controlState.error && (
        <p
          role="alert"
          className="shrink-0 border-b px-3 py-2 text-xs text-destructive"
        >
          {controlState.error}
        </p>
      )}
      {actionError && (
        <p
          role="alert"
          className="shrink-0 border-b px-3 py-2 text-xs text-destructive"
        >
          {actionError}
        </p>
      )}
      <div
        ref={slot}
        className="relative min-h-0 flex-1 overflow-hidden bg-background"
      >
        {(failure || !currentUrl) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <GlobeIcon className="size-7 text-muted-foreground/60" />
            {failure ? (
              <>
                <p
                  role="alert"
                  className="max-w-sm text-sm text-muted-foreground"
                >
                  {failure}
                </p>
                {available && (
                  <button
                    type="button"
                    className="text-xs underline underline-offset-4"
                    onClick={() => tabs.action(entry.id, "reload")}
                  >
                    Try again
                  </button>
                )}
              </>
            ) : (
              <p className="max-w-sm text-sm text-muted-foreground">
                Browse a website or open a local development server.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function BrowserButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35 [&>svg]:size-3.5"
    >
      {children}
    </button>
  );
}
