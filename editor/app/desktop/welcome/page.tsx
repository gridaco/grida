"use client";

/**
 * Desktop welcome window — the reference-first artwork studio front door.
 *
 * Composer-first and outcome-first: describe what you want, or gather references
 * from the gallery, and the workspace opens with that request as the first turn
 * of a new native chat (see {@link welcome_message}). The composer targets the
 * DEFAULT workspace — the managed root `~/Documents/Grida Projects`, always
 * registered — unless the top-left picker aims it at an existing project.
 * "Open folder…" and the recents list stay for opening work that already
 * exists. Submitting an otherwise empty composer simply enters the
 * selected/default workspace without starting a turn.
 *
 * The home NEVER mints a per-session folder: the agent roots at the workspace
 * and decides on turn one whether it becomes a board, a deck or a tree of
 * files (guided by its skills), writing only what it decides.
 *
 * A reference card opens related Library ideas; its Add action drops that
 * reference into the composer's tray. A slides template is selected directly
 * (references multi-select; a template is single-select, like choosing one
 * Keynote theme). Neither action starts work on its own. References fold into
 * the first message as plain URLs. A picked template is copied into the
 * workspace as its own deck, and the first message names that copy so the
 * agent adapts it. The model picker offers the native connections a new chat
 * can choose before its workspace opens; the opened workspace selects it.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { XIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";
import {
  getDesktopBridge,
  workspaces as workspacesNs,
  type Workspace,
} from "@/lib/desktop/bridge";
import { welcome_message } from "@/lib/desktop/welcome-message";
import type { NativeChatProfileCatalog } from "@grida/desktop-bridge";
import { dotcanvas } from "dotcanvas";
import { TitleBar } from "@/scaffolds/desktop/chrome/title-bar";
import { AgentComposerInput } from "@/scaffolds/desktop/shared/agent-composer-input";
import { NativeModelPicker } from "@/scaffolds/desktop/workbench/native-chat-controls";
import { WorkspaceCanvasCreation } from "@/scaffolds/desktop/workbench/workspace-canvas-creation";
import type { ComposerCatalog } from "@/kits/composer";
import {
  LibraryExplorerView,
  type LibraryExplorerViewHandle,
} from "@/kits/library-explorer";
import { workspaceWorkbenchHref } from "@/scaffolds/desktop/workbench/workspace-workbench-url";
import { resolveLibraryExplorerPage } from "@/scaffolds/desktop/shared/design-search";
import { SlidesTemplateGallery } from "@/scaffolds/desktop/home/slides-template-gallery";
// `import type` is erased at build — it does NOT pull the loader (and its
// fflate/dotcanvas deps) into the home chunk; the gallery's dynamic `import()`
// stays the sole code-split boundary. The home only holds the picked template
// object and copies its `files` (the unzipped bundle) into the workspace.
import type { SlidesTemplate } from "@/lib/slides-templates";
import { RecentProjectsCommand } from "@/scaffolds/desktop/home/recent-projects-command";
import { WorkspacePicker } from "@/scaffolds/desktop/home/workspace-picker";
import {
  ApplicationPreset,
  type ApplicationPresetId,
} from "@/scaffolds/desktop/home/application-preset";
import { PresetRail } from "@/scaffolds/desktop/home/preset-rail";
import { PresetChip } from "@/scaffolds/desktop/home/preset-chip";
import type { chat_vocabulary } from "@/lib/agent-chat/chat-vocabulary";
import { last_workspace } from "@/lib/desktop/last-workspace";

const NOOP = () => {};
const WELCOME_LIBRARY_SOURCE = { kind: "browse" } as const;

/**
 * The native host adds `?startup=restore-last-workspace` only to the cold-start
 * welcome window. Explicit Home navigation, File → New Window, auth callback,
 * and macOS re-activation all use plain `/desktop/welcome` and stay here.
 */
export default function DesktopWelcomePage() {
  return (
    <Suspense fallback={<StartupRestoreScreen />}>
      <DesktopWelcomeRoute />
    </Suspense>
  );
}

function DesktopWelcomeRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const shouldRestore = params.get("startup") === "restore-last-workspace";
  const onboardingWorkspaceId = params.get("onboardingWorkspace");
  const [checking, setChecking] = useState(shouldRestore);

  useEffect(() => {
    if (!shouldRestore) return;
    let cancelled = false;
    void last_workspace
      .resolve(window.localStorage, {
        list: workspacesNs.list,
        openFolder: workspacesNs.openFolder,
        readdir: workspacesNs.readdir,
      })
      .then((target) => {
        if (cancelled) return;
        if (target) {
          router.replace(last_workspace.href(target));
          return;
        }
        setChecking(false);
      })
      .catch((err) => {
        console.warn("[welcome] couldn't restore last workspace:", err);
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, shouldRestore]);

  return checking ? (
    <StartupRestoreScreen />
  ) : (
    <WelcomeSurface initialWorkspaceId={onboardingWorkspaceId} />
  );
}

function StartupRestoreScreen() {
  return (
    <div className="flex h-svh w-full flex-col bg-background">
      <TitleBar />
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Opening last workspace…
      </div>
    </div>
  );
}

/** The home composer targets no existing workspace (a fresh project is created
 *  on submit), so there are no `@` file refs or `/` skills to offer. A constant
 *  — not `useWorkspaceComposerCatalog("")`, which would fire doomed bridge
 *  readdirs per mount just to yield this same empty shape. */
const EMPTY_CATALOG: ComposerCatalog = { commands: [], mentions: [] };

function WelcomeSurface({
  initialWorkspaceId,
}: {
  initialWorkspaceId: string | null;
}) {
  const router = useRouter();
  // The home's single page-scroll container — everything (composer, gallery)
  // scrolls together inside it; the gallery virtualizes against it.
  const scrollRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<LibraryExplorerViewHandle>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The active `application_preset` (SPIKE). Mutated by the icon rail and the
  // composer's mode chip; re-themes the one shared home (placeholder now; the
  // gallery's visual references and the handoff seed are the next seams).
  const [preset, setPreset] = useState<ApplicationPresetId>(
    ApplicationPreset.DEFAULT
  );
  // The composer placeholder is the active preset's representative example.
  // It swaps when the mode changes, but does not rotate.
  const presetPlaceholder = ApplicationPreset.byId(preset).placeholder;
  // Recent-projects quick switcher (⌃R, VS Code's "Open Recent"). Keeps the
  // home minimal — no persistent recents list.
  const [commandOpen, setCommandOpen] = useState(false);
  // The composer's target: null = create a NEW project under the managed root
  // (the default, shown as "Default workspace"), or an existing workspace to
  // send the prompt into instead. Owned here; the top-left WorkspacePicker
  // mutates it and the composer's `start` reads it.
  const [target, setTarget] = useState<Workspace | null>(null);
  const pendingInitialWorkspaceId = useRef(initialWorkspaceId);
  // References the user has gathered from the gallery (multi-select). They seed
  // ONE fresh board on submit; a click in the gallery toggles membership here.
  const [pickedRefs, setPickedRefs] = useState<
    chat_vocabulary.DesignReference[]
  >([]);
  const selectedRefIds = useMemo(
    () => new Set(pickedRefs.map((p) => p.id)),
    [pickedRefs]
  );
  // The slides template the user picked from the gallery — single-select (you
  // start from ONE template, like choosing a Keynote theme). Null = none. It's
  // an attachment-style reference, NOT an instant start: the composer send seeds
  // its bundle into the session scratch and hands it to the agent (see `start`).
  const [pickedTemplate, setPickedTemplate] = useState<SlidesTemplate | null>(
    null
  );
  // A picked template only makes sense in slides mode (the template gallery is
  // slides-only). If the user switches the preset away, drop it so a stale
  // template chip can't linger over the reference gallery.
  useEffect(() => {
    if (preset !== "slides") setPickedTemplate(null);
  }, [preset]);
  // Composer docking: the composer starts as the in-flow hero, then floats as a
  // fixed bottom bar once it scrolls out of view — so you can keep writing while
  // browsing the gallery. It's the SAME element (its position toggles), so the
  // Tiptap draft, focus, and caret survive the transition; `heroHeight` is a
  // spacer that holds its old spot so the gallery doesn't jump when it detaches.
  const composerRef = useRef<HTMLDivElement>(null);
  const composerSlotRef = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);
  const [heroHeight, setHeroHeight] = useState<number>();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const refreshWorkspaces = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    try {
      const nextWorkspaces = await workspacesNs.list();
      setWorkspaces(nextWorkspaces);
      const pendingId = pendingInitialWorkspaceId.current;
      if (pendingId) {
        const opened = nextWorkspaces.find(
          (workspace) => workspace.id === pendingId
        );
        if (opened) setTarget((current) => current ?? opened);
        pendingInitialWorkspaceId.current = null;
      }
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
      const ids = new Set<string>();
      // The native reader has finite workers. Leave room for open editors
      // while checking every remembered workspace.
      for (let index = 0; index < workspaces.length; index += 2) {
        if (cancelled) return;
        await Promise.all(
          workspaces.slice(index, index + 2).map(async (w) => {
            try {
              const entries = await workspacesNs.readdir(w.id);
              if (
                entries.some((e) => e.rel_path === dotcanvas.MANIFEST_FILENAME)
              )
                ids.add(w.id);
            } catch {
              // Unavailable folders remain available as ordinary workspace rows.
            }
          })
        );
      }
      if (!cancelled) setCanvasIds(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaces]);

  // Native connection choices for the first chat. Only choices that do not
  // depend on a workspace are offered here; the opened workspace selects the
  // chosen one as a new connection. `null` keeps the workspace default.
  const [profiles, setProfiles] = useState<NativeChatProfileCatalog | null>(
    null
  );
  const [profileId, setProfileId] = useState<string | null>(null);
  const readProfiles = useCallback(() => {
    const list = getDesktopBridge()?.nativeChat?.welcomeProfiles;
    if (!list) return;
    void list()
      .then((next) => {
        setProfiles(next);
        // A choice that is no longer offered falls back to the default.
        setProfileId((current) =>
          current && next?.choices.some(({ id }) => id === current)
            ? current
            : null
        );
      })
      .catch(() => {
        // Without choices the first chat uses the workspace default.
      });
  }, []);
  useEffect(() => {
    readProfiles();
    // Settings can add a provider key or endpoint in another window.
    window.addEventListener("focus", readProfiles);
    return () => window.removeEventListener("focus", readProfiles);
  }, [readProfiles]);

  // Open a workspace and, when there is one, leave the first message for its
  // chat. An empty message enters the workspace without starting a turn.
  const start = useCallback(
    (text: string) => {
      if (busy) return;
      const template = pickedTemplate;
      const references = template ? [] : pickedRefs;
      // Picked context only makes sense for a fresh start in the default
      // workspace; plain text goes to the selected workspace.
      const fresh = !!template || references.length > 0;
      if ((fresh || text.trim()) && !getDesktopBridge()?.nativeChat) {
        setError("Chat isn't available in this version of Grida Desktop.");
        return;
      }
      setBusy(true);
      setError(null);
      void (async () => {
        try {
          const workspace =
            fresh || !target ? await workspacesNs.getDefault() : target;
          if (!workspace) {
            setError("No default workspace available on this host.");
            setBusy(false);
            return;
          }
          const copied = template
            ? await WorkspaceCanvasCreation.copy(workspace.id, template).catch(
                () => {
                  throw new Error(
                    "Couldn't copy the template into the workspace."
                  );
                }
              )
            : null;
          const message = welcome_message.compose({
            text,
            references,
            template:
              template && copied
                ? {
                    title: template.title,
                    slides: template.pages.length,
                    path: copied,
                  }
                : null,
          });
          if (
            message !== null &&
            !welcome_message.stash(workspace.id, { text: message, profileId })
          ) {
            setError("Couldn't keep your message for the workspace.");
            setBusy(false);
            return;
          }
          router.push(workspaceWorkbenchHref(workspace));
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Couldn't start a session."
          );
          setBusy(false); // navigation unmounts on success
        }
      })();
    },
    [busy, pickedTemplate, pickedRefs, target, profileId, router]
  );

  // A Library card's Add action toggles it in the composer's tray (multi-select)
  // instead of starting a board on its own — the user gathers several, then
  // starts one board from all of them via the composer / the tray's Start button.
  const togglePick = useCallback((pin: chat_vocabulary.DesignReference) => {
    setPickedRefs((cur) =>
      cur.some((p) => p.id === pin.id)
        ? cur.filter((p) => p.id !== pin.id)
        : [...cur, pin]
    );
  }, []);

  // Picking a slides template SELECTS it into the composer (single-select), like
  // attaching a reference — it does NOT start a session on its own. Clicking the
  // already-picked one clears it. The start (composer send / Enter) copies the
  // deck into the workspace and names the copy in the first message; see
  // `start`.
  const togglePickTemplate = useCallback((template: SlidesTemplate) => {
    setPickedTemplate((cur) => (cur?.name === template.name ? null : template));
  }, []);

  const onOpen = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setError("Desktop bridge not available.");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      const ws = await workspacesNs.chooseFolder();
      if (!ws) return;
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
      {/* Bare drag region — Settings moved to the rail footer below. */}
      <TitleBar />

      {/* Home-scoped icon rail + the shared home surface. The rail lives BELOW
          the title bar (so it never collides with the macOS traffic lights) and
          only mutates the active preset — it is not app-wide chrome. */}
      <div className="flex min-h-0 flex-1">
        <PresetRail value={preset} onChange={setPreset} />

        {/* One page-scroll container — composer hero then gallery scroll
            together (no nested scroll); the gallery virtualizes against this. */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {/* Top-left workspace picker — where a start lands (the managed
              ~/Documents/Grida Projects root by default, shown as "Default workspace")
              or which existing project to aim at. Borderless + friendly;
              replaces the old picker-above-composer + "start blank" row. */}
          <div className="px-3 pt-3">
            <WorkspacePicker
              value={target}
              onChange={setTarget}
              workspaces={workspaces}
              onOpenFolder={onOpen}
            />
          </div>
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 pb-10">
            {/* Composer hero — a generous top offset drops the input to roughly
              mid-screen, but the space below stays tight so the gallery sits
              close beneath it (not an even top/bottom split) and peeks in to
              invite the scroll that docks the composer. */}
            <div className="flex flex-col pt-[30vh]">
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
                    // Docked: the composer floats as a bare bottom bar — no card
                    // wrapper (no extra border/background/padding). It's just the
                    // input itself, lifted with a shadow (applied to the input
                    // below), so it reads as floating over the gallery rather than
                    // boxed in a panel. The references tray rides in the same stack.
                    docked &&
                      "fixed inset-x-4 bottom-4 z-30 mx-auto max-w-2xl duration-200 animate-in fade-in slide-in-from-bottom-4"
                  )}
                >
                  {/* Picked-template chip — the slides-mode counterpart of the
                  references tray: a single attachment-style chip for the deck the
                  user chose to start from (single-select). Neutral styling (no
                  accent) — it reads as an attachment, and starting is the
                  composer's own send. Its X removes; the gallery card also
                  toggles it. */}
                  {pickedTemplate && (
                    <div className="flex items-center gap-2 rounded-lg border bg-background p-1.5 shadow-sm">
                      <div className="size-10 shrink-0 overflow-hidden rounded border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element -- blob object URL; next/image can't optimize it */}
                        <img
                          src={pickedTemplate.pages[0]?.url}
                          alt=""
                          className="size-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {pickedTemplate.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Template · {pickedTemplate.pages.length} slides
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickedTemplate(null)}
                        aria-label={`Remove ${pickedTemplate.title} template`}
                        className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  )}
                  {/* Picked-references tray — a bare, compact row of thumbnails:
                  no panel, no label, no Clear/Start. Membership IS the state, so
                  each pin just removes on its hover-X, and starting is the
                  composer's own send. When docked the row floats above the input
                  in the same stack — same design language, lifted by shadow, not
                  boxed in a container. */}
                  {pickedRefs.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-0.5">
                      {pickedRefs.map((p) => (
                        <div
                          key={p.id}
                          className="group relative size-14 shrink-0 overflow-hidden rounded-lg border bg-background shadow-sm"
                        >
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => libraryRef.current?.navigate(p)}
                            aria-label={`Show ${p.title}`}
                            className="block size-full cursor-pointer disabled:cursor-default"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={p.url}
                              alt=""
                              draggable={false}
                              className="size-full select-none object-cover"
                            />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => togglePick(p)}
                            aria-label={`Remove ${p.title}`}
                            className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow transition group-hover:opacity-100 disabled:opacity-50"
                          >
                            <XIcon className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <AgentComposerInput
                    catalog={EMPTY_CATALOG}
                    // Docked: lift the input on its own shadow so it floats over
                    // the gallery — there's no card wrapper doing it anymore.
                    className={docked ? "shadow-xl" : undefined}
                    onSubmit={start}
                    isStreaming={false}
                    onStop={NOOP}
                    allowEmptySubmit
                    emptySubmitLabel={
                      pickedTemplate || pickedRefs.length > 0
                        ? "Start"
                        : "Open workspace"
                    }
                    autofocus
                    placeholder={
                      pickedTemplate
                        ? `Adapt the "${pickedTemplate.title}" template — describe your deck…`
                        : pickedRefs.length > 0
                          ? "Describe what to make from these references…"
                          : target
                            ? `Ask Grida to design something in ${target.name}…`
                            : presetPlaceholder
                    }
                    toolbarStart={
                      <PresetChip value={preset} onChange={setPreset} />
                    }
                    toolbarEnd={
                      <NativeModelPicker
                        profiles={{
                          active: profileId,
                          choices: profiles?.choices ?? [],
                          saved: [],
                        }}
                        busy={busy}
                        onSelect={(selection) =>
                          setProfileId(
                            selection.kind === "default" ? null : selection.id
                          )
                        }
                        onRefresh={readProfiles}
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
            </div>

            {/* Gallery — preset-aware. The library corpus (image/video pins)
              fits general/image/video, so those share the reference gallery.
              Slides swaps in the bundled starter templates instead — real
              `.canvas` decks served from /templates/slides/ (the
              `public/slides-templates` publishing unit; loaded lazily by the
              shared slides-template loader). Filtering the library corpus PER
              preset (image vs video) is a separate later seam. Both are part
              of the single page scroll (the reference gallery virtualizes
              against it). The "Ideas" label is universal — it heads whichever
              gallery renders. */}
            <div>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Start from an idea
              </h2>
              {preset === "slides" ? (
                <SlidesTemplateGallery
                  onPickTemplate={togglePickTemplate}
                  selectedName={pickedTemplate?.name ?? null}
                  disabled={busy}
                />
              ) : (
                <LibraryExplorerView
                  ref={libraryRef}
                  initialSource={WELCOME_LIBRARY_SOURCE}
                  loadPage={resolveLibraryExplorerPage}
                  onToggle={togglePick}
                  selectedIds={selectedRefIds}
                  disabled={busy}
                  scrollContainerRef={scrollRef}
                />
              )}
            </div>
          </div>
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
