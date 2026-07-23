"use client";

/**
 * Desktop welcome window — the reference-first artwork studio front door.
 *
 * Composer-first and outcome-first: describe what you want, or gather references
 * from the gallery — then Grida AUTO-CREATES a fresh, EMPTY project for you (a
 * plain folder under `~/Documents/Grida`) and hands your prompt to that
 * project's agent as its first turn via {@link welcome_handoff}. No workspace
 * picker, no folder dialog to get started: the newcomer never has to choose a
 * folder. "Open folder…" and the recents list stay for opening work that
 * already exists (files stay visible — a named tree, not hidden).
 *
 * The home NEVER mints a per-session folder and NEVER dirties the user's
 * workspace. Starting a session roots the agent at the DEFAULT workspace — the
 * managed root itself (`~/Documents/Grida`), always registered — and the agent
 * takes the wheel: whether the workspace becomes a board, a slides deck, or a
 * tree of files is the AGENT's choice on turn one (guided by the advertised
 * skills), and produced files land where the agent decides. The system provides
 * MINIMALLY — the default workspace + a per-session scratch dir. (The old flow
 * minted `~/Documents/Grida/<prompt>` folders per session and pre-picked where
 * to work; that's the legacy this replaces.)
 *
 * Clicking a gallery reference OR a slides template doesn't start anything — it
 * drops the pick into the composer's tray (references multi-select; a template
 * is single-select, like choosing one Keynote theme). The user can add a prompt,
 * then start ONE session. References fold into the first-turn prompt as plain
 * URLs; a picked template's unzipped `.canvas` bundle rides the handoff into the
 * session's SCRATCH dir — agent-only reference, like an attachment (WG
 * `scratch.md`), never the user's workspace — and the prompt tells the agent to
 * read it from scratch and build the adapted deck. Every start opens the MAIN
 * workbench (`/desktop/workspace`) — the full surface with the file tree,
 * tool-approval, and auto-accept — whose agent pane consumes the handoff and
 * auto-sends when there's a prompt.
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
import {
  welcome_handoff,
  type ScratchSeedFile,
  type WelcomeHandoff,
} from "@/lib/desktop/welcome-handoff";
import { onboarding_flag } from "@/lib/desktop/onboarding-flag";
import { FirstRunOnboarding } from "@/scaffolds/desktop/onboarding/first-run-onboarding";
import { dotcanvas } from "dotcanvas";
import { TitleBar } from "@/scaffolds/desktop/chrome/title-bar";
import { AgentComposerInput } from "@/scaffolds/desktop/shared/agent-composer-input";
import {
  DesktopModelPicker,
  useModelPickerState,
} from "@/scaffolds/desktop/shared/model-picker";
import { useEndpointProviders } from "@/scaffolds/desktop/shared/registered-models";
import type { ComposerCatalog } from "@/kits/composer";
import { workspaceWorkbenchHref } from "@/scaffolds/desktop/workbench/workspace-workbench-url";
import { ReferenceGallery } from "@/scaffolds/desktop/home/reference-gallery";
import { SlidesTemplateGallery } from "@/scaffolds/desktop/home/slides-template-gallery";
// `import type` is erased at build — it does NOT pull the loader (and its
// fflate/dotcanvas deps) into the home chunk; the gallery's dynamic `import()`
// stays the sole code-split boundary. The home only holds the picked template
// object and reads its `files` (the unzipped bundle) to seed the session scratch.
import type { SlidesTemplate } from "@/lib/slides-templates";
import { RecentProjectsCommand } from "@/scaffolds/desktop/home/recent-projects-command";
import { WorkspacePicker } from "@/scaffolds/desktop/home/workspace-picker";
import {
  ApplicationPreset,
  type ApplicationPresetId,
} from "@/scaffolds/desktop/home/application-preset";
import { PresetRail } from "@/scaffolds/desktop/home/preset-rail";
import { PresetChip } from "@/scaffolds/desktop/home/preset-chip";
import type { AgentDesignSearch } from "@grida/agent/tools/design-search";
import { last_workspace } from "@/lib/desktop/last-workspace";

const NOOP = () => {};

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

  return checking ? <StartupRestoreScreen /> : <WelcomeSurface />;
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

/** Fold picked references into the first-turn prompt as plain context. The
 *  workspace starts empty — there is no seeded document to place references in
 *  anymore — so the agent receives them as URLs and decides what to make of
 *  them (a moodboard board, style refs for a deck, …). Returns `text` unchanged
 *  when nothing is picked. */
function composePromptWithRefs(
  text: string,
  refs: AgentDesignSearch.DesignSearchResult[]
): string {
  if (refs.length === 0) return text;
  const list = refs
    .map((r) => `- ${r.title || "reference"}: ${r.url}`)
    .join("\n");
  const lead = text || "Use these visual references as the starting point.";
  return `${lead}\n\nReferences:\n${list}`;
}

function WelcomeSurface() {
  const router = useRouter();
  // The home's single page-scroll container — everything (composer, gallery)
  // scrolls together inside it; the gallery virtualizes against it.
  const scrollRef = useRef<HTMLDivElement>(null);
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
  // References the user has gathered from the gallery (multi-select). They seed
  // ONE fresh board on submit; a click in the gallery toggles membership here.
  const [pickedRefs, setPickedRefs] = useState<
    AgentDesignSearch.DesignSearchResult[]
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
  // First-run onboarding. Start hidden so the server render and first client
  // render agree — `localStorage` is client-only, so seeding in the initializer
  // would render the modal during SSR and tear it down on hydration for
  // returning users. Decide after mount.
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
  // the session's first turn runs on the chosen model.
  const {
    model_id: modelId,
    setModelId,
    is_user_pick: isUserPick,
  } = useModelPickerState({
    current_id: null,
    sessions: [],
    endpoints,
  });

  // Stash the (possibly empty) prompt + model + scratch seed for a workspace's
  // agent and become the workspace window. Shared by the default-workspace and
  // existing-target paths; an empty prompt lands primed but doesn't auto-send a
  // turn. `scratchSeed` (a picked template's unzipped bundle) rides into the
  // session scratch on the first turn — agent-only, never the workspace.
  const handoffAndGo = useCallback(
    (
      workspace: Workspace,
      prompt: string,
      scratchSeed?: ScratchSeedFile[],
      templateContext?: WelcomeHandoff["template_context"]
    ) => {
      welcome_handoff.set(workspace.id, {
        prompt,
        // Carry the model only when the user deliberately picked one. An
        // untouched default — or a GG upgrade that hasn't resolved yet — is
        // left off so the workspace resolves its own (GG-aware) default;
        // otherwise a fast submit before the async session settles would
        // seed the workspace with the Claude-Code default as a false
        // explicit pick, and keyless users would hit `auth_required` (#942).
        ...(isUserPick ? { model_id: modelId } : {}),
        ...(scratchSeed && scratchSeed.length > 0
          ? { scratch_seed: scratchSeed }
          : {}),
        ...(templateContext ? { template_context: templateContext } : {}),
      });
      router.push(workspaceWorkbenchHref(workspace));
    },
    [modelId, isUserPick, router]
  );

  // Start a session in the DEFAULT workspace (`~/Documents/Grida`). We NEVER mint
  // a per-session folder — that littered the managed root and pre-picked where to
  // work; the agent roots at the default workspace and takes the wheel, writing
  // only what it decides. Optional `scratchSeed` (a picked template's unzipped
  // bundle) rides the handoff into the session scratch — agent-only reference,
  // never the user's workspace.
  const startFresh = useCallback(
    async (opts: {
      prompt: string;
      scratchSeed?: ScratchSeedFile[];
      templateContext?: WelcomeHandoff["template_context"];
    }) => {
      const bridge = getDesktopBridge();
      if (!bridge) {
        setError("Desktop bridge not available.");
        return;
      }
      try {
        setBusy(true);
        setError(null);
        const ws = await workspacesNs.getDefault();
        if (!ws) {
          setError("No default workspace available on this host.");
          setBusy(false);
          return;
        }
        // Opens the MAIN workbench (`/desktop/workspace`) — the full surface with
        // the file tree, tool-approval bar, and auto-accept picker; its agent pane
        // consumes the handoff and auto-sends the prompt as turn one.
        handoffAndGo(ws, opts.prompt, opts.scratchSeed, opts.templateContext);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Couldn't start a session."
        );
        setBusy(false); // navigation unmounts on success; only reset on failure
      }
    },
    [handoffAndGo]
  );

  // The one "start" path, shared by the composer's send and the reference
  // tray's Start button. Picked references (if any) fold into the first-turn
  // prompt as context and always start a FRESH project — they take precedence
  // over the target picker, since they're only meaningful for a new start.
  const start = useCallback(
    (text: string) => {
      const t = text.trim();
      if (busy) return;
      // A picked template starts a session in the default workspace. Its unzipped
      // `.canvas` bundle rides into the session SCRATCH (agent-only), and the
      // template itself rides as a `user_template_selection` CONTEXT part (a chip
      // in the transcript, a `<user_template_selection>` block for the model) —
      // NOT fabricated into the message. The user's raw text `t` is the only ask
      // (empty ⇒ a context-only send; the agent-pane fires it anyway).
      if (pickedTemplate) {
        void startFresh({
          prompt: t,
          scratchSeed: pickedTemplate.files,
          templateContext: {
            name: pickedTemplate.name,
            title: pickedTemplate.title,
            slides: pickedTemplate.pages.length,
            system: pickedTemplate.system,
          },
        });
        return;
      }
      if (pickedRefs.length > 0) {
        void startFresh({ prompt: composePromptWithRefs(t, pickedRefs) });
        return;
      }
      if (!t) return;
      // Send into an existing opened workspace, or the default workspace.
      if (target) handoffAndGo(target, t);
      else void startFresh({ prompt: t });
    },
    [busy, pickedTemplate, pickedRefs, target, handoffAndGo, startFresh]
  );

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

  // Picking a slides template SELECTS it into the composer (single-select), like
  // attaching a reference — it does NOT start a session on its own. Clicking the
  // already-picked one clears it. The start (composer send / Enter) attaches it
  // as a `user_template_selection` context part + seeds the deck's bundle into
  // scratch, handing it to the agent to adapt; see `start`.
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
              ~/Documents/Grida root by default, shown as "Default workspace")
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
                  )}
                  <AgentComposerInput
                    catalog={EMPTY_CATALOG}
                    // Docked: lift the input on its own shadow so it floats over
                    // the gallery — there's no card wrapper doing it anymore.
                    className={docked ? "shadow-xl" : undefined}
                    onSubmit={start}
                    isStreaming={false}
                    onStop={NOOP}
                    // Welcome uses the reference tray ("Start from an idea"), not
                    // composer attachments — its `start` ignores files/uploads, so
                    // hide the "+" rather than offer a dead control.
                    attach={false}
                    allowEmptySubmit={pickedTemplate != null}
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
                    toolbar={
                      <>
                        <PresetChip value={preset} onChange={setPreset} />
                        <DesktopModelPicker
                          value={modelId}
                          onValueChange={setModelId}
                          endpoints={endpoints}
                        />
                      </>
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
                <ReferenceGallery
                  onPick={togglePick}
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
