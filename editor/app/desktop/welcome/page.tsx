"use client";

/**
 * Desktop welcome window.
 *
 * A composer-first home: pick a workspace, describe what you want, and
 * submitting hands the prompt off to that workspace's agent chat (a
 * fresh session) via {@link welcome_handoff}. Opening a folder or
 * clicking a recent both navigate into the workspace IDE
 * (`/desktop/workspace?id=…`), same-window by design — this window
 * becomes the workspace window (the nav guard in `window.ts` allows
 * any `/desktop/*` route).
 *
 * Workspaces are backed by `bridge.workspaces.*` and re-fetched on
 * window focus, so opening a folder via the File menu surfaces here
 * immediately. Window/tab UX is intentionally not the SDK's concern
 * (see `docs/wg/desktop/process-model.md`).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  PlusIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@app/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import {
  getDesktopBridge,
  workspaces as workspacesNs,
  type Workspace,
} from "@/lib/desktop/bridge";
import { welcome_handoff } from "@/lib/desktop/welcome-handoff";
import {
  TitleBar,
  TITLEBAR_NO_DRAG_STYLE,
} from "@/scaffolds/desktop/chrome/title-bar";
import { AgentComposerInput } from "@/scaffolds/desktop/shared/agent-composer-input";
import { useWorkspaceComposerCatalog } from "@/scaffolds/desktop/shared/use-workspace-composer-catalog";
import { workspaceWorkbenchHref } from "@/scaffolds/desktop/workbench/workspace-workbench-url";

const NOOP = () => {};

export default function DesktopWelcomePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  // The composer's target. Defaults to the most-recent workspace once
  // the list loads (see effect below) so the composer is usable without
  // an explicit pick, while still letting the user retarget.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    try {
      setWorkspaces(await workspacesNs.list());
    } catch (err) {
      // Non-fatal — the welcome page can still open a folder.
      console.warn("[welcome] workspaces.list failed:", err);
    }
  }, []);

  useEffect(() => {
    void refreshWorkspaces();
    // Re-fetch on focus so the File menu's "Open Folder…" surfaces here
    // even when the welcome window is already visible.
    const onFocus = () => void refreshWorkspaces();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshWorkspaces]);

  // Keep the selection pointed at a valid, most-recent workspace: seed
  // it when the list first arrives, and re-seed if the selected one is
  // forgotten.
  useEffect(() => {
    setSelectedId((cur) =>
      cur && workspaces.some((w) => w.id === cur)
        ? cur
        : (workspaces[0]?.id ?? null)
    );
  }, [workspaces]);

  // Composer catalog (`@` file refs + `/` skills) for the selected
  // workspace. Empty until one is selected — the hook tolerates the
  // empty id and yields an empty catalog.
  const catalog = useWorkspaceComposerCatalog(selectedId ?? "");

  const onOpen = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setError("Desktop bridge not available.");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      // `createDirectory` surfaces the macOS "New Folder" button; macOS-only,
      // safely ignored on Windows/Linux.
      const paths = await bridge.dialog.open({
        properties: ["openDirectory", "createDirectory"],
      });
      if (!paths || paths.length === 0) return;
      const ws = await workspacesNs.openFolder(paths[0]);
      await refreshWorkspaces();
      setSelectedId(ws.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open folder.");
    } finally {
      setBusy(false);
    }
  }, [refreshWorkspaces]);

  const onForget = useCallback(
    async (id: string) => {
      try {
        await workspacesNs.forget(id);
        await refreshWorkspaces();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't forget.");
      }
    },
    [refreshWorkspaces]
  );

  const onSubmit = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || !selectedId) return;
      // Stash for the workspace chat to pick up + auto-send as a fresh
      // session, then become the workspace window.
      welcome_handoff.set(selectedId, t);
      router.push(`/desktop/workspace?id=${encodeURIComponent(selectedId)}`);
    },
    [selectedId, router]
  );

  const selected = workspaces.find((w) => w.id === selectedId) ?? null;
  const hasWorkspaces = workspaces.length > 0;

  return (
    <div
      data-testid="desktop-welcome"
      className="flex h-svh w-full flex-col bg-background"
    >
      <TitleBar>
        <div className="ml-auto" style={TITLEBAR_NO_DRAG_STYLE}>
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            aria-label="Settings"
            title="Settings"
          >
            <Link href="/desktop/settings" prefetch={false}>
              <SettingsIcon />
            </Link>
          </Button>
        </div>
      </TitleBar>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-10 px-6 py-12">
          {/* Composer hero — target workspace + prompt. */}
          <div className="flex flex-col gap-2.5">
            <div className="flex">
              <Popover open={pickerOpen} onOpenChange={setPickerOpen} modal>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    role="combobox"
                    aria-expanded={pickerOpen}
                    className="max-w-[16rem] gap-1.5"
                  >
                    <FolderIcon className="size-3.5 shrink-0" />
                    <span className="min-w-0 truncate">
                      {selected?.name ?? "Select a workspace"}
                    </span>
                    <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-0">
                  <Command>
                    <CommandInput placeholder="Search workspaces…" />
                    <CommandList>
                      <CommandEmpty>No workspace found.</CommandEmpty>
                      {hasWorkspaces && (
                        <CommandGroup heading="Recent">
                          {workspaces.map((w) => (
                            <CommandItem
                              key={w.id}
                              value={w.id}
                              keywords={[w.name, w.root]}
                              onSelect={() => {
                                setSelectedId(w.id);
                                setPickerOpen(false);
                              }}
                            >
                              <span className="truncate">{w.name}</span>
                              {w.id === selectedId && (
                                <CheckIcon className="ml-auto size-4" />
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                      <CommandGroup>
                        <CommandItem
                          value="open folder new workspace"
                          onSelect={() => {
                            setPickerOpen(false);
                            void onOpen();
                          }}
                        >
                          Open folder…
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <AgentComposerInput
              catalog={catalog}
              onSubmit={onSubmit}
              isStreaming={false}
              onStop={NOOP}
              autofocus
              placeholder={
                selected
                  ? `Ask Grida to design something in ${selected.name}…`
                  : "Open a folder to start designing…"
              }
            />
          </div>

          {/* Divider — extra breathing room between the composer and the
              recents list. */}
          <div className="border-t" />

          {/* Recent — click a row to open that workspace; the last row
              opens a new folder so adding one is always discoverable. */}
          <section className="flex flex-col gap-1.5">
            {hasWorkspaces && (
              <h2 className="px-1 text-xs font-medium text-muted-foreground">
                Recent
              </h2>
            )}
            <ul className="flex flex-col gap-0.5">
              {workspaces.map((w) => (
                <li
                  key={w.id}
                  className="group flex items-center gap-2 rounded-md transition-colors hover:bg-accent"
                >
                  <Link
                    href={workspaceWorkbenchHref(w)}
                    prefetch={false}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5"
                  >
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 truncate text-sm font-medium">
                      {w.name}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                      {w.root}
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onForget(w.id)}
                    aria-label={`Forget ${w.name}`}
                    className="mr-1 opacity-0 group-hover:opacity-100"
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={onOpen}
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <PlusIcon className="size-4 shrink-0" />
                  Open folder…
                </button>
              </li>
            </ul>
          </section>

          {error && (
            <p
              role="alert"
              className="text-center text-xs text-destructive"
              onClick={() => setError(null)}
            >
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
