"use client";

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  GlobeIcon,
  Loader2Icon,
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
import { BrowserViewport } from "./browser-viewport";
import type { WorkspaceBrowserTabs } from "./workspace-browser-tabs";

/** Browser chrome remains in the shell; only the page slot is native content. */
export function BrowserPane({
  tabs,
  entry,
  active,
}: {
  tabs: WorkspaceBrowserTabs;
  entry: WorkspaceBrowserTabs.Entry;
  active: boolean;
}) {
  const address = useRef<HTMLInputElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const consumedLocation = useRef(0);
  const [draft, setDraft] = useState(entry.page?.url ?? entry.url ?? "");
  const [occluded, setOccluded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const viewport = useMemo(
    () =>
      new BrowserViewport(
        (layout) => tabs.layout(entry.id, entry.page?.id ?? null, layout),
        setOccluded
      ),
    [tabs, entry.id, entry.page?.id]
  );
  const page = entry.page;
  const failure = entry.error ?? page?.failure?.message;
  const currentUrl = page?.url ?? entry.url;

  useLayoutEffect(
    () => (slot.current ? viewport.connect(slot.current) : undefined),
    [viewport]
  );
  useLayoutEffect(
    () => viewport.setActive(active && !!page?.url && !failure),
    [viewport, active, page?.url, failure]
  );
  useEffect(() => {
    setDraft(currentUrl ?? "");
  }, [currentUrl]);
  useEffect(() => {
    if (!active) setMenuOpen(false);
  }, [active]);
  useEffect(() => {
    if (!active || entry.locationRevision <= consumedLocation.current) return;
    consumedLocation.current = entry.locationRevision;
    address.current?.focus();
    address.current?.select();
  }, [active, entry.locationRevision]);

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
      <form
        className="desktop-no-drag flex h-11 shrink-0 items-center gap-1 border-b px-2"
        onSubmit={(event) => {
          event.preventDefault();
          tabs.navigate(entry.id, draft);
          address.current?.blur();
        }}
      >
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
          disabled={!page && !entry.error}
          onClick={() =>
            tabs.action(entry.id, page?.loading ? "stop" : "reload")
          }
        >
          {page?.loading ? <XIcon /> : <RotateCwIcon />}
        </BrowserButton>
        <div className="mx-1 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-2 focus-within:ring-2 focus-within:ring-ring">
          {page?.loading ? (
            <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <input
            ref={address}
            aria-label="Website address"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Enter a website address"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft(currentUrl ?? "");
                address.current?.blur();
                tabs.action(entry.id, "focus");
              }
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
          {entry.storageScope === "ephemeral" && (
            <span className="text-[10px] text-muted-foreground">Private</span>
          )}
        </div>
        <DropdownMenu open={active && menuOpen} onOpenChange={setMenuOpen}>
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
              if (!active) event.preventDefault();
            }}
          >
            <DropdownMenuItem
              disabled={!page?.url}
              onSelect={() => tabs.action(entry.id, "openExternal")}
            >
              <ExternalLinkIcon />
              Open in default browser
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => void tabs.clearSession()}
            >
              <Trash2Icon />
              Clear workspace browser data…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </form>
      <div
        ref={slot}
        style={{ borderRadius: "var(--browser-page-radius, 0px)" }}
        className="relative min-h-0 flex-1 overflow-hidden bg-background"
      >
        {(failure || !currentUrl || occluded) && (
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
                <button
                  type="button"
                  className="text-xs underline underline-offset-4"
                  onClick={() => tabs.action(entry.id, "reload")}
                >
                  Try again
                </button>
              </>
            ) : (
              <p className="max-w-sm text-sm text-muted-foreground">
                {occluded
                  ? "Page hidden while workbench controls are open."
                  : "Browse a website or open a local development server."}
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
