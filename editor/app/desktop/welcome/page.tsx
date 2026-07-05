"use client";

/**
 * Desktop welcome window — the reference-first artwork studio front door.
 *
 * Composer-first and outcome-first: describe what you want, or gather references
 * from the gallery — then Grida AUTO-CREATES a fresh project
 * for you — a `.canvas` board under `~/Documents/Grida` — then hands your
 * prompt to that project's agent as a fresh first turn via {@link welcome_handoff}.
 * No workspace picker, no folder dialog to get started: the newcomer never has
 * to choose a folder. "Open folder…" and the recents list stay for opening
 * work that already exists (files stay visible — a named tree, not hidden).
 *
 * Clicking a gallery reference doesn't start a board on its own — it drops the
 * pin into the composer's picked-references tray (multi-select). The user can
 * collect several, optionally add a prompt, then start ONE project seeded with
 * all of them. Every start opens the MAIN workbench (`/desktop/workspace`) — the
 * full surface with the file tree, tool-approval, and auto-accept — whose agent
 * pane consumes the handoff and auto-sends when there's a prompt. The seeded
 * `.canvas` board is the document the agent works on.
 *
 * Landing surface: `/desktop/workspace?id=…` (the workbench), whose agent pane
 * already consumes the handoff and auto-sends turn one. The handoff carries the
 * `dotcanvas` skill so the artwork agent knows the board format from the start,
 * even before any editor tab is open.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  PlusIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
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
import { onboarding_flag } from "@/lib/desktop/onboarding-flag";
import { FirstRunOnboarding } from "@/scaffolds/desktop/onboarding/first-run-onboarding";
import { dotcanvas } from "dotcanvas";
import {
  TitleBar,
  TITLEBAR_NO_DRAG_STYLE,
} from "@/scaffolds/desktop/chrome/title-bar";
import { AgentComposerInput } from "@/scaffolds/desktop/shared/agent-composer-input";
import {
  DesktopModelPicker,
  useModelPickerState,
} from "@/scaffolds/desktop/shared/model-picker";
import { useEndpointProviders } from "@/scaffolds/desktop/shared/registered-models";
import type { ComposerCatalog } from "@/kits/composer";
import { workspaceWorkbenchHref } from "@/scaffolds/desktop/workbench/workspace-workbench-url";
import { ReferenceGallery } from "@/scaffolds/desktop/home/reference-gallery";
import { RecentProjectsCommand } from "@/scaffolds/desktop/home/recent-projects-command";
import type { AgentDesignSearch } from "@grida/agent/tools/design-search";

const NOOP = () => {};

/** The home composer targets no existing workspace (a fresh project is created
 *  on submit), so there are no `@` file refs or `/` skills to offer. A constant
 *  — not `useWorkspaceComposerCatalog("")`, which would fire doomed bridge
 *  readdirs per mount just to yield this same empty shape. */
const EMPTY_CATALOG: ComposerCatalog = { commands: [], mentions: [] };

/** A short, friendly folder name derived from the prompt (the sidecar slugifies
 *  it further). First few words keep the project recognizable in the tree. */
function deriveProjectName(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.slice(0, 48) || "Untitled";
}

export default function DesktopWelcomePage() {
  const router = useRouter();
  // The home's single page-scroll container — everything (composer, gallery)
  // scrolls together inside it; the gallery virtualizes against it.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Recent-projects quick switcher (⌃R, VS Code's "Open Recent"). Keeps the
  // home minimal — no persistent recents list.
  const [commandOpen, setCommandOpen] = useState(false);
  // The composer's target: null = create a NEW project (the default), or an
  // existing workspace to send the prompt into instead.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState<Workspace | null>(null);
  // References the user has gathered from the gallery (multi-select). They seed
  // ONE fresh board on submit; a click in the gallery toggles membership here.
  const [pickedRefs, setPickedRefs] = useState<
    AgentDesignSearch.DesignSearchResult[]
  >([]);
  const selectedRefIds = useMemo(
    () => new Set(pickedRefs.map((p) => p.id)),
    [pickedRefs]
  );
  // Composer docking: the composer starts as the in-flow hero, then floats as a
  // fixed bottom bar once it scrolls out of view — so you can keep writing while
  // browsing the gallery. It's the SAME element (its position toggles), so the
  // Tiptap draft, focus, and caret survive the transition; `heroHeight` is a
  // spacer that holds its old spot so the gallery doesn't jump when it detaches.
  const composerRef = useRef<HTMLDivElement>(null);
  const composerSlotRef = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);
  const [heroHeight, setHeroHeight] = useState<number>();
  // First-run onboarding (issue #813): zero-config Claude detection. Start
  // hidden so the server render and first client render agree — `localStorage`
  // is client-only, so seeding in the initializer would render the modal during
  // SSR and tear it down on hydration for returning users. Decide after mount.
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => {
    if (!onboarding_flag.isComplete()) setOnboarding(true);
  }, []);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const refreshWorkspaces = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    try {
      setWorkspaces(await workspacesNs.list());
    } catch (err) {
      // Non-fatal — the welcome page can still create or open a folder.
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

  // ⌃R toggles the recent-projects palette (Ctrl, NOT Cmd — Cmd+R reloads the
  // window in Electron). preventDefault so no reload accelerator fires.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.metaKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        if (e.repeat) return; // holding the key must not flicker the palette
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Track the composer's natural (in-flow) height so the spacer can reserve it
  // when the composer detaches to float — otherwise the flow collapses and the
  // gallery jumps up by the composer's height at the dock moment. Measurements
  // are frozen WHILE docked: the floating card has its own padding/border, and
  // adopting its height would skew the spacer. When the composer re-enters the
  // flow its size changes, so the observer fires again and re-measures.
  const dockedRef = useRef(docked);
  dockedRef.current = docked;
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const measure = () => {
      if (!dockedRef.current) setHeroHeight(el.offsetHeight);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Dock the composer once its hero slot scrolls past the top of the page, and
  // restore it in place when scrolled back up. We watch the SLOT (which stays in
  // flow as a spacer even while the composer floats) rather than the composer
  // itself — the floated bar re-enters the viewport at the bottom, so watching it
  // would immediately undock and thrash. Gone above the top edge → float.
  useEffect(() => {
    const root = scrollRef.current;
    const slot = composerSlotRef.current;
    if (!root || !slot) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const rootTop = entry.rootBounds?.top ?? 0;
        setDocked(
          !entry.isIntersecting && entry.boundingClientRect.top <= rootTop
        );
      },
      { root, threshold: 0 }
    );
    io.observe(slot);
    return () => io.disconnect();
  }, []);

  // Auto-detect `.canvas` decks/boards among the recents: a folder containing
  // `.canvas.json` opens the board file window (`/desktop/file?id=`) instead of
  // the file workbench. Probed via the bridge once per list.
  const [canvasIds, setCanvasIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ids = await Promise.all(
        workspaces.map(async (w) => {
          try {
            const entries = await workspacesNs.readdir(w.id);
            return entries.some(
              (e) => e.rel_path === dotcanvas.MANIFEST_FILENAME
            )
              ? w.id
              : null;
          } catch {
            return null;
          }
        })
      );
      if (!cancelled) {
        setCanvasIds(new Set(ids.filter((x): x is string => x !== null)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaces]);

  // Configured endpoint providers (issue #806): registered local models
  // join the welcome composer's picker too.
  const endpoints = useEndpointProviders();

  // Model selection for the composer. No sessions here (the welcome page never
  // loads a chat), so this just holds the user's pick; it rides the handoff so
  // the created project's first turn runs on the chosen model.
  const {
    model_id: modelId,
    setModelId,
    is_user_pick: isUserPick,
  } = useModelPickerState({
    current_id: null,
    sessions: [],
    endpoints,
  });

  // Stash the (possibly empty) prompt + model + skill for a workspace's agent and
  // become the workspace window. Shared by the new-project and existing-target
  // paths; an empty prompt lands primed but doesn't auto-send a turn.
  const handoffAndGo = useCallback(
    (workspace: Workspace, prompt: string) => {
      welcome_handoff.set(workspace.id, {
        prompt,
        // Carry the model only when the user deliberately picked one. An
        // untouched default — or a GG upgrade that hasn't resolved yet — is
        // left off so the workspace resolves its own (GG-aware) default;
        // otherwise a fast submit before the async session settles would
        // seed the workspace with the Claude-Code default as a false
        // explicit pick, and keyless users would hit `auth_required` (#942).
        ...(isUserPick ? { model_id: modelId } : {}),
        skills: ["dotcanvas"],
      });
      router.push(workspaceWorkbenchHref(workspace));
    },
    [modelId, isUserPick, router]
  );

  const createAndGo = useCallback(
    async (opts: {
      name?: string;
      prompt: string;
      seed?: { documents: { src: string }[] };
    }) => {
      const bridge = getDesktopBridge();
      if (!bridge) {
        setError("Desktop bridge not available.");
        return;
      }
      try {
        setBusy(true);
        setError(null);
        const ws = await workspacesNs.createProject({
          name: opts.name,
          seed: opts.seed,
        });
        // Every start opens the MAIN workbench (`/desktop/workspace`) — the full
        // surface with the file tree, tool-approval bar, and auto-accept mode
        // picker. The seeded `.canvas` board is the document the agent works on;
        // the workbench's agent pane consumes the handoff and auto-sends when
        // there's a prompt. (The lean board window at `/desktop/file` stays for
        // directly opening an existing `.canvas`/file — Finder, ⌃R, File ▸ Open.)
        handoffAndGo(ws, opts.prompt);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Couldn't create a project."
        );
        setBusy(false); // navigation unmounts on success; only reset on failure
      }
    },
    [handoffAndGo]
  );

  // The one "start" path, shared by the composer's send and the reference
  // tray's Start button. References (if any) always seed a fresh board and take
  // precedence over the target picker — they're only meaningful for a new board.
  const start = useCallback(
    (text: string) => {
      const t = text.trim();
      if (busy) return;
      if (pickedRefs.length > 0) {
        void createAndGo({
          name: t ? deriveProjectName(t) : pickedRefs[0]?.title || "Artwork",
          prompt: t,
          seed: { documents: pickedRefs.map((p) => ({ src: p.url })) },
        });
        return;
      }
      if (!t) return;
      // No references: send into an existing project, or auto-create from words.
      if (target) handoffAndGo(target, t);
      else void createAndGo({ name: deriveProjectName(t), prompt: t });
    },
    [busy, pickedRefs, target, handoffAndGo, createAndGo]
  );

  const onStartBlank = useCallback(() => {
    if (busy) return;
    void createAndGo({ prompt: "" });
  }, [busy, createAndGo]);

  // Clicking a gallery reference toggles it in the composer's tray (multi-select)
  // instead of starting a board on its own — the user gathers several, then
  // starts one board from all of them via the composer / the tray's Start button.
  const togglePick = useCallback(
    (pin: AgentDesignSearch.DesignSearchResult) => {
      setPickedRefs((cur) =>
        cur.some((p) => p.id === pin.id)
          ? cur.filter((p) => p.id !== pin.id)
          : [...cur, pin]
      );
    },
    []
  );

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
      setTarget(ws); // aim the composer at the just-opened project
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open folder.");
    } finally {
      setBusy(false);
    }
  }, [refreshWorkspaces]);

  return (
    <div
      data-testid="desktop-welcome"
      // The desktop shell locks <body> to h-svh/overflow-hidden, so the home
      // owns its layout: one scroll pane with the composer hero on top and the
      // reference gallery below. Once the hero scrolls out of view the composer
      // detaches into a floating bottom bar (see `docked`) so you can keep
      // writing while browsing.
      className="flex h-svh w-full flex-col bg-background"
    >
      {onboarding && (
        <FirstRunOnboarding
          onDone={(openedWorkspaceId) => {
            setOnboarding(false);
            // A folder opened during onboarding lives only in the wizard until
            // now — pull it into this page's list so recents reflect it.
            if (openedWorkspaceId) void refreshWorkspaces();
          }}
        />
      )}
      <TitleBar>
        <div
          className="ml-auto flex items-center gap-0.5"
          style={TITLEBAR_NO_DRAG_STYLE}
        >
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

      {/* One page-scroll container — composer hero then gallery scroll together
          (no nested scroll); the gallery virtualizes against this element. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-10 pt-[14vh]">
          {/* Composer slot — narrow and centered; the gallery below spans the
              wider container. This slot stays in flow and is what the dock
              observer watches; once the composer floats it reserves `heroHeight`
              so detaching doesn't jump the gallery up. */}
          <div
            ref={composerSlotRef}
            className="mx-auto w-full max-w-2xl"
            style={docked ? { height: heroHeight } : undefined}
          >
            {/* The composer itself. In the hero it's a plain in-flow block; once
                docked it becomes a floating card fixed to the bottom, sliding up
                on entry. It's the SAME element in both states, so the Tiptap
                draft, focus, and caret carry across the transition. */}
            <div
              ref={composerRef}
              className={cn(
                "flex flex-col gap-2",
                docked &&
                  "fixed inset-x-4 bottom-4 z-30 mx-auto max-w-2xl rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur-sm duration-200 animate-in fade-in slide-in-from-bottom-4"
              )}
            >
              {/* Target picker + blank, above the input. */}
              <div className="flex items-center gap-3 px-1">
                <Popover open={pickerOpen} onOpenChange={setPickerOpen} modal>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      role="combobox"
                      aria-expanded={pickerOpen}
                      className="max-w-[16rem] gap-1.5"
                    >
                      {target ? (
                        <FolderIcon className="size-3.5 shrink-0" />
                      ) : (
                        <PlusIcon className="size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 truncate">
                        {target?.name ?? "New project"}
                      </span>
                      <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  {/* Radix flips on collision, so this opens down in the hero and
                      up when the composer is docked at the bottom. */}
                  <PopoverContent align="start" className="w-72 p-0">
                    <Command>
                      <CommandInput placeholder="Search projects…" />
                      <CommandList>
                        <CommandEmpty>No project found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="new project"
                            onSelect={() => {
                              setTarget(null);
                              setPickerOpen(false);
                            }}
                          >
                            <PlusIcon className="text-muted-foreground" />
                            New project
                            {target === null && (
                              <CheckIcon className="ml-auto size-4" />
                            )}
                          </CommandItem>
                        </CommandGroup>
                        {workspaces.length > 0 && (
                          <CommandGroup heading="Recent">
                            {workspaces.map((w) => (
                              <CommandItem
                                key={w.id}
                                value={`${w.name} ${w.root}`}
                                onSelect={() => {
                                  setTarget(w);
                                  setPickerOpen(false);
                                }}
                              >
                                <FolderIcon className="text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate">
                                  {w.name}
                                </span>
                                {target?.id === w.id && (
                                  <CheckIcon className="ml-auto size-4" />
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        <CommandGroup>
                          <CommandItem
                            value="open folder existing project"
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
                {/* Hidden while references are picked: "blank" means blank, and
                    rendering it would either silently drop the gathered picks or
                    duplicate the tray's Start — the tray owns starting then. */}
                {pickedRefs.length === 0 && (
                  <button
                    type="button"
                    onClick={onStartBlank}
                    disabled={busy}
                    className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    or start with a blank
                  </button>
                )}
              </div>
              {/* Picked-references tray — the gallery drops pins here so several
                  can be gathered before starting one board from all of them. A
                  single horizontal scroll row keeps the composer compact — which
                  matters most once it's floating. */}
              {pickedRefs.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-muted-foreground">
                      {pickedRefs.length} reference
                      {pickedRefs.length > 1 ? "s" : ""} selected — add a
                      prompt, or just start
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPickedRefs([])}
                        className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                      >
                        Clear
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => start("")}
                        disabled={busy}
                        className="h-6 gap-1 px-2 text-xs"
                      >
                        Start
                        <ArrowRightIcon className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-2 overflow-x-auto">
                    {pickedRefs.map((p) => (
                      <div
                        key={p.id}
                        className="group relative size-16 shrink-0 overflow-hidden rounded-md border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt={p.title}
                          className="size-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => togglePick(p)}
                          aria-label={`Remove ${p.title}`}
                          className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow transition group-hover:opacity-100"
                        >
                          <XIcon className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <AgentComposerInput
                catalog={EMPTY_CATALOG}
                onSubmit={start}
                isStreaming={false}
                onStop={NOOP}
                autofocus
                placeholder={
                  pickedRefs.length > 0
                    ? "Describe what to make from these references…"
                    : target
                      ? `Ask Grida to design something in ${target.name}…`
                      : "Describe an image to create, or start from a reference…"
                }
                toolbar={
                  <DesktopModelPicker
                    value={modelId}
                    onValueChange={setModelId}
                    endpoints={endpoints}
                  />
                }
              />
              {/* Kept inside the composer so a submit error is visible even when
                  the composer is floating (docked). */}
              {error && (
                <p
                  role="alert"
                  className="px-1 text-center text-xs text-destructive"
                  onClick={() => setError(null)}
                >
                  {error}
                </p>
              )}
            </div>
          </div>

          {/* Reference gallery — part of the single page scroll (virtualizes
              against the scroll container above). */}
          <ReferenceGallery
            onPick={togglePick}
            selectedIds={selectedRefIds}
            disabled={busy}
            scrollContainerRef={scrollRef}
          />
        </div>
      </div>

      <RecentProjectsCommand
        open={commandOpen}
        onOpenChange={setCommandOpen}
        workspaces={workspaces}
        canvasIds={canvasIds}
        onOpenFolder={onOpen}
      />
    </div>
  );
}
