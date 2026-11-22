"use client";

/**
 * Desktop welcome window — a shared composer with galleries for output presets.
 *
 * Composer-first and outcome-first: describe what you want, or gather references
 * from the gallery, and the workspace opens with that request as the first turn
 * of a new native chat (see {@link welcome_message}). The composer targets the
 * DEFAULT workspace — the managed root `~/Documents/Grida Projects`, always
 * registered — unless the workspace picker aims it at an existing project.
 * "Open folder…" and the recents list stay for opening work that already
 * exists. Submitting an otherwise empty composer simply enters the
 * selected/default workspace without starting a turn.
 *
 * The home NEVER mints a per-session folder: the agent roots at the workspace
 * and decides on turn one whether it becomes a board, a deck or a tree of
 * files (guided by its skills), writing only what it decides.
 *
 * In Images, a reference card opens related Library ideas; its Add action drops that
 * reference into the composer's tray. A slides template is selected directly
 * (references multi-select; a template is single-select, like choosing one
 * Keynote theme). Neither action starts work on its own. Image references
 * travel with the first message as context. A picked template is copied into the
 * workspace as its own deck, and the first message names that copy so the
 * agent adapts it. The model picker offers the native connections a new chat
 * can choose before its workspace opens; the opened workspace selects it.
 */

import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import {
  getDesktopBridge,
  useDesktopBridge,
  workspaces as workspacesNs,
  type Workspace,
} from "@/lib/desktop/bridge";
import { welcome_message } from "@/lib/desktop/welcome-message";
import { imagesMessageContext } from "@/lib/desktop/images-message-context";
import { workflowMessageContext } from "@/lib/desktop/workflow-message-context";
import { dotcanvas } from "dotcanvas";
import { TitleBar } from "@/scaffolds/desktop/chrome/title-bar";
import { AgentComposer } from "@/scaffolds/desktop/shared/agent-composer";
import {
  OutgoingMessage,
  OutgoingMessageStatus,
} from "@/scaffolds/desktop/shared/outgoing-message";
import { AgentPermissionConfirmation } from "@/scaffolds/desktop/shared/agent-permission-confirmation";
import { HomeComposer } from "@/scaffolds/desktop/home/home-composer";
import { NativeAttachmentCard } from "@/scaffolds/desktop/workbench/native-attachment-card";
import { useWorkspaceFileMentions } from "@/scaffolds/desktop/shared/use-workspace-file-mentions";
import { WorkspaceCanvasCreation } from "@/scaffolds/desktop/workbench/workspace-canvas-creation";
import {
  ComposerDropArea,
  type ComposerCatalog,
  type ComposerController,
  type ComposerTransfer,
} from "@/kits/composer";
import {
  LibraryExplorerView,
  type LibraryExplorerViewHandle,
} from "@/kits/library-explorer";
import { WorkspaceOpening } from "@/scaffolds/desktop/workbench/workspace-workbench-url";
import { resolveLibraryExplorerPage } from "@/scaffolds/desktop/shared/design-search";
import { SlidesTemplateGallery } from "@/scaffolds/desktop/home/slides-template-gallery";
import {
  WorkflowGallery,
  WorkflowReferenceTray,
} from "@/scaffolds/desktop/home/workflow-gallery";
import {
  workflowShowcaseUrl,
  type WorkflowShowcase,
} from "@/scaffolds/desktop/home/workflow-showcases";
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
import type { chat_vocabulary } from "@/lib/agent-chat/chat-vocabulary";
import { WindowContentState } from "@/lib/desktop/window-content-state";
import { WindowContentMarker } from "@/scaffolds/desktop/shared/window-content-marker";
import { NativeChatController } from "@/lib/agent-chat/native-chat-controller";

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

  useEffect(() => {
    if (!shouldRestore) return;
    let cancelled = false;
    void WindowContentState.resolve(window.localStorage, {
      list: workspacesNs.list,
      openFolder: workspacesNs.openFolder,
      readdir: workspacesNs.readdir,
    })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[welcome] couldn't restore window content:", err);
        }
        return null;
      })
      .then((target) => {
        if (cancelled) return;
        if (target && target.surface !== "home") {
          router.replace(WindowContentState.href(target));
          return;
        }
        // The startup directive is spent. Back and reload should stay on Home.
        const url = new URL(window.location.href);
        url.searchParams.delete("startup");
        window.history.replaceState(null, "", url);
      });
    return () => {
      cancelled = true;
    };
  }, [router, shouldRestore]);

  function selectPreset(next: ApplicationPresetId) {
    const url = new URL(window.location.href);
    if (ApplicationPreset.fromParam(url.searchParams.get("preset")) === next) {
      return;
    }
    if (next === ApplicationPreset.DEFAULT) url.searchParams.delete("preset");
    else url.searchParams.set("preset", next);
    window.history.pushState(null, "", url);
  }

  return shouldRestore ? (
    <StartupRestoreScreen />
  ) : (
    <WelcomeSurface
      initialWorkspaceId={onboardingWorkspaceId}
      preset={ApplicationPreset.fromParam(params.get("preset"))}
      onPresetChange={selectPreset}
    />
  );
}

function StartupRestoreScreen() {
  return (
    <div className="flex h-svh w-full flex-col bg-background">
      <TitleBar />
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Restoring window…
      </div>
    </div>
  );
}

function WelcomeHeading({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <h1 className="absolute inset-x-0 bottom-full mb-8 flex items-baseline justify-center gap-x-1.5 text-center text-lg font-normal tracking-tight whitespace-nowrap select-none sm:text-xl">
      <span className="sr-only">{question} </span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={question}
          aria-hidden="true"
          className="shrink-0"
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.12 }}
        >
          {question.split(" ").map((word, index) => (
            <Fragment key={index}>
              {index > 0 && " "}
              <motion.span
                className="inline-block"
                initial={reduceMotion ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: reduceMotion ? 0 : 0.085 + index * 0.026,
                  duration: reduceMotion ? 0 : 0.16,
                  ease: "easeOut",
                }}
              >
                {word}
              </motion.span>
            </Fragment>
          ))}
        </motion.span>
      </AnimatePresence>
      <motion.span
        layout={reduceMotion ? false : "position"}
        transition={{ layout: { duration: 0.32, ease: "easeInOut" } }}
        className="inline-flex min-w-0 max-w-full items-baseline"
      >
        <span className="shrink-0 pr-1">in</span>
        {children}?
      </motion.span>
    </h1>
  );
}

function WelcomeSurface({
  initialWorkspaceId,
  preset,
  onPresetChange,
}: {
  initialWorkspaceId: string | null;
  preset: ApplicationPresetId;
  onPresetChange: (preset: ApplicationPresetId) => void;
}) {
  const router = useRouter();
  const bridge = useDesktopBridge();
  const [composer] = useState(() => new HomeComposer());
  const staged = useSyncExternalStore(
    composer.subscribe,
    composer.read,
    composer.read
  );
  useEffect(() => {
    void composer.restore();
    return composer.resetPermissionMode;
  }, [composer]);
  useEffect(() => {
    if (staged.permissionError) toast.error(staged.permissionError);
  }, [staged.permissionError]);
  const filePicker = useRef<HTMLInputElement>(null);
  const imagePicker = useRef<HTMLInputElement>(null);
  const editorRef = useRef<
    | (Pick<ComposerController, "readDocument" | "restoreDocument"> & {
        draftKey: string;
      })
    | null
  >(null);
  useLayoutEffect(() => {
    window.addEventListener("pagehide", composer.flushNextDraft);
    return () => {
      window.removeEventListener("pagehide", composer.flushNextDraft);
      composer.flushNextDraft();
    };
  }, [composer]);
  const galleryRef = useRef<HTMLDivElement>(null);
  const galleryMotionRef = useRef<HTMLDivElement>(null);
  // The home's single page-scroll container — everything (composer, gallery)
  // scrolls together inside it; the gallery virtualizes against it.
  const scrollRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<LibraryExplorerViewHandle>(null);
  const [openingFolder, setBusy] = useState(false);
  const busy =
    openingFolder || staged.busy || staged.permissionBusy || !!staged.outgoing;
  const {
    acceptsAutomaticApprovalReview,
    defaultsToAutomaticReview,
    welcomeProfiles,
    welcomeTurnCapabilities,
    prepareWelcomeFullAccess,
    prepareWelcomeAutomaticReview,
    answerWelcomeFullAccess,
    startWelcomeFullAccess,
    welcomeFullAccessAcrossPresets,
  } = bridge?.nativeChat ?? {};
  useEffect(
    () =>
      composer.connectAutomaticReview(
        acceptsAutomaticApprovalReview,
        defaultsToAutomaticReview
      ),
    [composer, acceptsAutomaticApprovalReview, defaultsToAutomaticReview]
  );
  const accessHost =
    prepareWelcomeFullAccess &&
    answerWelcomeFullAccess &&
    startWelcomeFullAccess
      ? {
          prepare: prepareWelcomeFullAccess,
          prepareAutomatic: staged.automaticReviewAvailable
            ? prepareWelcomeAutomaticReview
            : undefined,
          answer: answerWelcomeFullAccess,
          start: startWelcomeFullAccess,
        }
      : undefined;
  const showWorkflows = preset === "workflows";
  const showImages = preset === "image";
  const showSlides = preset === "slides";
  const showGallery = showWorkflows || showImages || showSlides;
  const presetSpec = ApplicationPreset.byId(preset);
  const PresetIcon = presetSpec.icon;
  // Recent-projects quick switcher (⌃R, VS Code's "Open Recent"). Keeps the
  // home minimal — no persistent recents list.
  const [commandOpen, setCommandOpen] = useState(false);
  // Null targets the managed default workspace; an explicit choice is honored
  // for text, references and templates alike.
  const [target, setTarget] = useState<Workspace | null>(null);
  // Older Desktop builds revoke the approval on every preset URL change.
  const permissionPresetScope =
    welcomeFullAccessAcrossPresets === true ? undefined : preset;
  useEffect(
    () => composer.resetPermissionMode(),
    [composer, permissionPresetScope, target?.id]
  );
  const composerDraft = useMemo(
    () => composer.draftFor(target?.id ?? "default"),
    [composer, target?.id]
  );
  useEffect(() => {
    composer.recoverDraft(
      composerDraft.key,
      (workspaceId, requestId) =>
        welcome_message.pending(workspaceId)?.message.requestId === requestId
    );
  }, [composer, composerDraft.key]);
  const pendingInitialWorkspaceId = useRef(initialWorkspaceId);
  const [defaultWorkspace, setDefaultWorkspace] = useState<Workspace | null>(
    null
  );
  const defaultWorkspaceRead = useRef<Promise<Workspace | null> | null>(null);
  const destination = target ?? defaultWorkspace;
  const mentions = useWorkspaceFileMentions(destination?.id);
  const catalog = useMemo<ComposerCatalog>(
    () => ({ commands: [], mentions }),
    [mentions]
  );
  // Keep the Images picks while browsing other presets.
  const [pickedRefs, setPickedRefs] = useState<
    chat_vocabulary.DesignReference[]
  >([]);
  const selectedRefIds = useMemo(
    () => new Set(pickedRefs.map((p) => p.id)),
    [pickedRefs]
  );
  const [workflowSelection, setWorkflowSelection] = useState<
    readonly WorkflowShowcase[]
  >([]);
  const workflowPicks = useMemo(
    () =>
      workflowSelection.map((showcase, index) => ({
        showcase,
        number: index + 1,
      })),
    [workflowSelection]
  );
  const selectedWorkflows = showWorkflows ? workflowPicks : undefined;
  // The slides template the user picked from the gallery — single-select (you
  // start from ONE template, like choosing a Keynote theme). Null = none. It's
  // an attachment-style reference, NOT an instant start: the composer send seeds
  // its bundle into the session scratch and hands it to the agent (see `start`).
  const [templatePick, setPickedTemplate] = useState<SlidesTemplate | null>(
    null
  );
  const pickedTemplate = showSlides ? templatePick : null;
  useEffect(() => {
    if (!showSlides) setPickedTemplate(null);
  }, [showSlides]);
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

  const previousPreset = useRef(preset);
  useLayoutEffect(() => {
    if (previousPreset.current === preset) return;
    previousPreset.current = preset;
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
    setDocked(false);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const animation = galleryMotionRef.current?.animate(
      [
        { opacity: 0.35, transform: "translateX(12px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 220, easing: "ease-out", fill: "backwards" }
    );
    return () => animation?.cancel();
  }, [preset]);

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
        if (opened && !composer.read().outgoing)
          setTarget((current) => current ?? opened);
        pendingInitialWorkspaceId.current = null;
      }
    } catch (err) {
      // Non-fatal — the welcome page can still create or open a folder.
      console.warn("[welcome] workspaces.list failed:", err);
    }
  }, [composer]);

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
  // gallery jumps up by the composer's height at the dock moment. Freeze the
  // in-flow spacer while docked, and keep measuring the floating composer so
  // the Workflows gallery can scroll clear of it as the draft grows.
  const dockedRef = useRef(docked);
  dockedRef.current = docked;
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const scroller = scrollRef.current;
    const measure = () => {
      const height = el.offsetHeight;
      if (!dockedRef.current) setHeroHeight(height);
      scroller?.style.setProperty("--welcome-composer-height", `${height}px`);
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
  const modelSelection = useMemo(
    () => new NativeChatController.ModelSelection(),
    []
  );
  const {
    profiles,
    profilesLoaded,
    profileId,
    error: profileReadError,
  } = useSyncExternalStore(
    modelSelection.subscribe,
    modelSelection.read,
    modelSelection.read
  );
  const awaitingProfiles = !!welcomeProfiles && !profilesLoaded;
  useLayoutEffect(
    () =>
      composer.connectTurnCapabilities(
        destination?.id,
        profileId,
        !awaitingProfiles ? welcomeTurnCapabilities : undefined
      ),
    [
      composer,
      destination?.id,
      profileId,
      awaitingProfiles,
      welcomeTurnCapabilities,
    ]
  );
  useEffect(() => {
    composer.initializeEffort(profiles?.newChatDefault?.effort);
  }, [composer, profiles?.newChatDefault?.effort]);
  const readProfiles = useCallback(() => {
    if (welcomeProfiles) void modelSelection.refresh(welcomeProfiles);
  }, [modelSelection, welcomeProfiles]);
  const refreshOptions = useCallback(() => {
    void composer.refreshTurnCapabilities();
    if (defaultWorkspaceRead.current) return;
    const request = workspacesNs.getDefault();
    defaultWorkspaceRead.current = request;
    void request
      .then((workspace) => {
        if (defaultWorkspaceRead.current === request)
          setDefaultWorkspace(workspace);
      }, NOOP)
      .finally(() => {
        if (defaultWorkspaceRead.current === request)
          defaultWorkspaceRead.current = null;
      });
  }, [composer]);
  useEffect(() => {
    const refresh = () => {
      readProfiles();
      refreshOptions();
      composer.refreshAutomaticReview();
    };
    refresh();
    // Settings can add a provider key or endpoint in another window.
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      modelSelection.release();
      defaultWorkspaceRead.current = null;
    };
  }, [bridge, composer, readProfiles, refreshOptions, modelSelection]);

  // Open a workspace and, when there is one, leave the first message for its
  // chat. An empty message enters the workspace without starting a turn.
  const submission = useCallback(
    (text: string): HomeComposer.Input => {
      const template = pickedTemplate;
      const workflowReferences = selectedWorkflows?.map(
        ({ number, showcase }) => ({
          number,
          title: showcase.title,
          showcaseUrl: workflowShowcaseUrl(showcase.slug),
          sourceUrl: `https://github.com/gridaco/fx/tree/main/examples/${showcase.sourceFolder}`,
          templateId: showcase.templateId,
          posterUrl: showcase.preview.image,
        })
      );
      const messageContext = showWorkflows
        ? workflowMessageContext(workflowReferences ?? [])
        : showImages
          ? imagesMessageContext(pickedRefs)
          : undefined;
      const hasRequest =
        text.trim() ||
        template ||
        messageContext?.displayParts.length ||
        composer.read().attachment;
      if (hasRequest) {
        const chat = getDesktopBridge()?.nativeChat;
        if (!chat)
          throw new Error(
            "Chat isn't available in this version of Grida Desktop."
          );
        if ((template || messageContext) && !chat.submitMessage)
          throw new Error(
            "Update Grida Desktop to send this request. Your draft is still here."
          );
      }
      return {
        text,
        prompt: ApplicationPreset.prompt(preset, text),
        profileId,
        target: destination,
        references: [],
        messageContext,
        ...(template && {
          template: {
            name: template.name,
            copy: async (workspaceId: string) => ({
              title: template.title,
              slides: template.pages.length,
              path: await WorkspaceCanvasCreation.copy(workspaceId, template),
            }),
          },
        }),
      };
    },
    [
      pickedTemplate,
      pickedRefs,
      selectedWorkflows,
      showWorkflows,
      showImages,
      destination,
      profileId,
      composer,
      preset,
    ]
  );
  const submissionHost: HomeComposer.Host = {
    defaultWorkspace: () =>
      defaultWorkspaceRead.current ?? workspacesNs.getDefault(),
    stash: welcome_message.stash,
    open: (workspace) => router.push(WorkspaceOpening.href(workspace)),
  };
  const reportSubmitError = (error: unknown) =>
    toast.error(
      error instanceof Error ? error.message : "Couldn't start a session."
    );

  const capture = (text: string, document: unknown) => {
    try {
      return composer.capture(submission(text), document, submissionHost, {
        ...composerDraft,
        read: () =>
          editorRef.current?.draftKey === composerDraft.key
            ? editorRef.current.readDocument()
            : undefined,
      });
    } catch (error) {
      reportSubmitError(error);
      return false;
    }
  };

  const restoreOutgoing = () => {
    const editor = editorRef.current;
    if (
      !editor ||
      !composer.restoreCaptured((document) =>
        document == null
          ? editor.readDocument() == null
          : editor.restoreDocument(document)
      )
    )
      toast.error(
        "Keep or clear your current text before restoring the earlier draft."
      );
  };

  const discardOutgoing = () => {
    composer.discardCaptured();
    setPickedTemplate(null);
    setPickedRefs([]);
    setWorkflowSelection([]);
  };

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

  const toggleWorkflowReference = useCallback((showcase: WorkflowShowcase) => {
    setWorkflowSelection((current) =>
      current.some((pick) => pick.slug === showcase.slug)
        ? current.filter((pick) => pick.slug !== showcase.slug)
        : [...current, showcase]
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
      toast.error("Desktop bridge not available.");
      return;
    }
    try {
      setBusy(true);
      const ws = await workspacesNs.chooseFolder();
      if (!ws) return;
      await refreshWorkspaces();
      setTarget(ws); // aim the composer at the just-opened project
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open folder.");
    } finally {
      setBusy(false);
    }
  }, [refreshWorkspaces]);

  // The whole Home window accepts external files/folders through the same
  // intake as the editor. The shared drop zone consumes each gesture once.
  const transferAttachment = (event: ComposerTransfer.Event) => {
    if (!busy) composer.transfer(event);
  };

  return (
    <ComposerDropArea
      onTransfer={transferAttachment}
      data-testid="desktop-welcome"
      // The desktop shell locks <body> to h-svh/overflow-hidden, so the home
      // owns its layout: one scroll pane with the composer hero on top and the
      // reference gallery below. Once the hero scrolls out of view the composer
      // detaches into a floating bottom bar (see `docked`) so you can keep
      // writing while browsing.
      className="flex h-svh w-full flex-col bg-background"
    >
      <WindowContentMarker surface="home" />
      <AgentPermissionConfirmation
        review={staged.permissionReview}
        onAnswer={composer.answerPermissionReview}
      />
      {/* Bare drag region — Settings moved to the rail footer below. */}
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <PresetRail value={preset} onChange={onPresetChange} />

        {/* One page-scroll container — composer hero then gallery scroll
            together (no nested scroll); the gallery virtualizes against this. */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
          style={
            showWorkflows && docked
              ? {
                  scrollPaddingBottom:
                    "calc(var(--welcome-composer-height, 7rem) + 1rem)",
                }
              : undefined
          }
        >
          <div
            className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 pt-11 pb-10"
            // Reserve room before docking so the end of the scroll range
            // already clears the composer on the scroll that docks it.
            style={
              showWorkflows
                ? {
                    paddingBottom:
                      "calc(var(--welcome-composer-height, 7rem) + 2.5rem)",
                  }
                : undefined
            }
          >
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
                className="relative mx-auto w-full max-w-2xl"
                style={docked ? { height: heroHeight } : undefined}
              >
                <WelcomeHeading question={presetSpec.composerQuestion}>
                  <span className="contents" inert={busy}>
                    <WorkspacePicker
                      inline
                      value={target}
                      onChange={(workspace) => {
                        if (!composer.read().outgoing) setTarget(workspace);
                      }}
                      workspaces={workspaces}
                      onOpenFolder={onOpen}
                    />
                  </span>
                </WelcomeHeading>
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
                  {staged.outgoing && (
                    <div className="flex flex-col gap-1">
                      <OutgoingMessage {...staged.outgoing}>
                        <OutgoingMessageStatus
                          status={staged.outgoing.error ? "failed" : "sending"}
                          error={staged.outgoing.error}
                          onRetry={
                            staged.outgoing.retryable
                              ? () => composer.retryCaptured(submissionHost)
                              : undefined
                          }
                        />
                      </OutgoingMessage>
                      {staged.outgoing.error && !staged.outgoing.handedOff && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={restoreOutgoing}
                          >
                            Restore draft
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={discardOutgoing}
                          >
                            Discard
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {!staged.outgoing && pickedTemplate && (
                    <div className="flex items-center gap-2 rounded-lg border bg-background p-1.5 shadow-sm">
                      <div className="size-10 shrink-0 overflow-hidden rounded border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element -- blob object URL; next/image can't optimize it */}
                        <img
                          src={
                            pickedTemplate.pages[
                              pickedTemplate.openingPageIndex
                            ]?.url
                          }
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
                  {!staged.outgoing && showImages && pickedRefs.length > 0 && (
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
                  {!staged.outgoing &&
                    selectedWorkflows &&
                    selectedWorkflows.length > 0 && (
                      <WorkflowReferenceTray
                        picks={selectedWorkflows}
                        disabled={busy}
                        onToggle={toggleWorkflowReference}
                      />
                    )}
                  <AgentComposer
                    access={{
                      mode: staged.permissionMode,
                      available: !!accessHost,
                      automaticReview:
                        staged.automaticReviewAvailable &&
                        (!!defaultsToAutomaticReview ||
                          !!accessHost?.prepareAutomatic),
                      staged: true,
                      busy,
                      onOpen: composer.refreshAutomaticReview,
                      onChange: (mode) => {
                        composer.selectPermissionMode(
                          mode,
                          {
                            workspace: destination,
                            defaultWorkspace: workspacesNs.getDefault,
                          },
                          accessHost
                        );
                      },
                    }}
                    draft={composerDraft}
                    draftRef={(editor) => {
                      editorRef.current =
                        editor?.readDocument && editor.restoreDocument
                          ? {
                              draftKey: composerDraft.key,
                              readDocument: editor.readDocument,
                              restoreDocument: editor.restoreDocument,
                            }
                          : null;
                    }}
                    submissionScope={composerDraft.key}
                    catalog={catalog}
                    className={cn("@container", docked && "shadow-xl")}
                    onCapture={capture}
                    onSubmit={(text) =>
                      composer.submit(submission(text), submissionHost)
                    }
                    onSubmitError={reportSubmitError}
                    awaitSubmission
                    submitting={staged.busy}
                    canSubmit={!busy}
                    isStreaming={false}
                    onStop={NOOP}
                    allowEmptySubmit
                    emptySubmitLabel={
                      selectedWorkflows?.length ||
                      (showImages && pickedRefs.length > 0)
                        ? "Send"
                        : pickedTemplate || staged.attachment
                          ? "Start"
                          : "Open workspace"
                    }
                    autofocus
                    onAttachmentTransfer={transferAttachment}
                    attachments={
                      staged.attachment && (
                        <NativeAttachmentCard
                          name={staged.attachment.file.name}
                          size={
                            staged.attachment.kind === "directory"
                              ? undefined
                              : staged.attachment.file.size
                          }
                          png={staged.attachment.file.type === "image/png"}
                          mimeType={
                            staged.attachment.kind === "directory"
                              ? "inode/directory"
                              : staged.attachment.file.type
                          }
                          preview={
                            staged.attachment.kind === "file" &&
                            /^image\/(png|jpeg|webp|gif)$/.test(
                              staged.attachment.file.type
                            )
                              ? staged.attachment.file
                              : null
                          }
                          onRemove={composer.removeAttachment}
                        />
                      )
                    }
                    actions={{
                      files: {
                        disabled: busy || staged.goal,
                        onSelect: () => filePicker.current?.click(),
                      },
                      image: {
                        disabled: busy || staged.goal,
                        onSelect: () => imagePicker.current?.click(),
                      },
                      library: showImages
                        ? {
                            disabled: busy || staged.goal,
                            onSelect: () => {
                              galleryRef.current?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                              galleryRef.current?.focus({
                                preventScroll: true,
                              });
                            },
                          }
                        : undefined,
                      plan: {
                        offered: !!bridge?.nativeChat?.submitInRegime,
                        active: staged.plan,
                        disabled: busy,
                        onChange: composer.selectPlan,
                      },
                      goal: {
                        offered: !!bridge?.nativeChat?.startGoal,
                        active: staged.goal,
                        disabled: busy || !!staged.attachment,
                        removeDisabled: busy,
                        onChange: composer.selectGoal,
                      },
                    }}
                    commands={[
                      ...(bridge?.nativeChat?.submitInRegime
                        ? [
                            {
                              id: "plan" as const,
                              run: () => composer.selectPlan(true),
                            },
                          ]
                        : []),
                      ...(bridge?.nativeChat?.startGoal
                        ? [
                            {
                              id: "goal" as const,
                              run: () => composer.selectGoal(true),
                            },
                          ]
                        : []),
                    ]}
                    intents={
                      preset !== ApplicationPreset.DEFAULT
                        ? [
                            {
                              id: preset,
                              label: presetSpec.label,
                              tooltip: presetSpec.composerTooltip,
                              icon: <PresetIcon />,
                              disabled: busy,
                              onRemove: () =>
                                onPresetChange(ApplicationPreset.DEFAULT),
                            },
                          ]
                        : []
                    }
                    model={{
                      loading: awaitingProfiles,
                      initialError: awaitingProfiles ? profileReadError : null,
                      profiles: {
                        active: profileId,
                        subscriptionIssue: profiles?.subscriptionIssue,
                        openAiIssue: profiles?.openAiIssue,
                        choices: profiles?.choices ?? [],
                        saved: profiles?.saved ?? [],
                      },
                      busy,
                      onSelect: (selection) => modelSelection.choose(selection),
                      onRefresh: readProfiles,
                      refreshError: profileReadError,
                      effort: staged.effort,
                      speed:
                        !staged.goal && welcomeTurnCapabilities
                          ? {
                              value: staged.speed ?? "standard",
                              capabilities: staged.turnCapabilities,
                              onChange: composer.selectSpeed,
                              refresh: refreshOptions,
                            }
                          : undefined,
                      onEffort: composer.selectEffort,
                      goal: staged.goal,
                    }}
                  />
                  <input
                    ref={filePicker}
                    type="file"
                    className="hidden"
                    aria-label="Attach file"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file)
                        composer.transfer({
                          resources: [{ kind: "file", file }],
                        });
                      event.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={imagePicker}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    aria-label="Attach image"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file)
                        composer.transfer({
                          resources: [{ kind: "file", file }],
                        });
                      event.currentTarget.value = "";
                    }}
                  />
                  {staged.notice && (
                    <p
                      role="status"
                      className="px-1 text-xs text-muted-foreground"
                    >
                      {staged.notice}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {showGallery && (
              <div ref={galleryMotionRef}>
                {showWorkflows ? (
                  <WorkflowGallery
                    picks={workflowPicks}
                    disabled={busy}
                    onToggle={toggleWorkflowReference}
                  />
                ) : (
                  <div ref={galleryRef} tabIndex={-1}>
                    <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                      Start from an idea
                    </h2>
                    {showSlides ? (
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
                )}
              </div>
            )}
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
    </ComposerDropArea>
  );
}
