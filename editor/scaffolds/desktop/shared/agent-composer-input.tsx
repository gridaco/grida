"use client";

/**
 * `AgentComposerInput` — the desktop agent chat's input, built on the
 * `@/kits/composer` Tiptap kit. Replaces the plain `PromptInputTextarea`
 * so the chat input gains slash `/` commands (skills) and `@` mentions
 * (workspace file references), plus light rich text.
 *
 * Headless-ish: the caller supplies the `catalog` (commands + mentions)
 * and a `toolbar` (e.g. the model picker), and receives the lowered
 * prompt text on submit. The composer owns trigger state + editing; this
 * component owns the surrounding frame + send/stop affordances.
 *
 * Lowering: the prompt is `message.meta.text` plus an explicit list of
 * any referenced file paths (from `@`-mentions / file-ref parts) so the
 * agent can resolve them even when the chip text alone is ambiguous.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpIcon,
  LibraryIcon,
  PlusIcon,
  SquareIcon,
  UploadIcon,
} from "lucide-react";
import type { FileUIPart } from "ai";
import { Button } from "@app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import { cn } from "@app/ui/lib/utils";
import {
  ComposerAttachmentCards,
  ComposerContent,
  ComposerProvider,
  ComposerTransfer,
  ComposerTriggerMenu,
  useComposer,
  type ComposerCatalog,
  type ComposerMessage,
} from "@/kits/composer";
import {
  InputResourcePolicy,
  InputResourceRouter,
  OPERABLE_FILE_POLICY,
  PreparedResourceLedger,
  ScratchSeedBudget,
  type SendExtras,
} from "@/lib/agent-chat";
import { ai as desktopAi, useDesktopBridge } from "@/lib/desktop/bridge";
import { AgentLibraryAttachmentPicker } from "./agent-library-attachment-picker";
import type { DesignLibraryPin } from "./design-search";

const NO_PROVIDER_FILE_MIMES: readonly string[] = [];

/**
 * A `/`-command that runs an action (e.g. `/compact`) instead of being
 * lowered into the prompt. Shown in the trigger menu; intercepted on
 * submit. Distinct from skill commands, which become a prompt hint.
 */
export type ComposerCommandAction = {
  id: string;
  title: string;
  description?: string;
  run: () => void | Promise<void>;
};

export type AgentComposerInputProps = {
  catalog: ComposerCatalog;
  /** Action `/`-commands (e.g. `/compact`). Merged into the menu, ahead
   *  of the catalog's own commands, and intercepted on submit. */
  commandActions?: ComposerCommandAction[];
  /**
   * Receives the lowered prompt text, any inlined image attachments as AI-SDK
   * `file` parts (perceive-only), and `extras` — operable file uploads (scratch
   * bytes + their marker). Empty submissions (no text AND no attachments) are
   * filtered unless `allowEmptySubmit` is set.
   */
  onSubmit: (
    text: string,
    files?: FileUIPart[],
    extras?: SendExtras
  ) => void | Promise<void>;
  isStreaming: boolean;
  /**
   * The session's combined busy signal (streaming OR maintenance like
   * compaction OR core-busy), as used by the turn-queue controller to decide
   * whether a submit enqueues. Text can ride the queue, but the queue is
   * text-only — so image submits are blocked whenever `busy`, not just while
   * THIS client streams. Defaults to `isStreaming` when omitted.
   */
  busy?: boolean;
  onStop: () => void;
  placeholder?: string;
  autofocus?: boolean;
  /**
   * Exact provider-native MIME capability declared by the selected runtime and
   * model seam. A broad `multimodal` flag is intentionally insufficient: when
   * omitted, direct provider attachments are unavailable.
   */
  providerFileMimes?: readonly string[];
  /** Exact MIME types the selected provider can fetch from a remote URL.
   * Empty by default: model MIME support alone never implies network fetch. */
  providerUrlFileMimes?: readonly string[];
  /**
   * Whether non-image files may be staged into session scratch. Workspace-less
   * chat surfaces pass `false`: they have no tool-visible scratch binding, so
   * accepting a PDF/zip there would create an inoperable attachment. Inline
   * images remain available. Defaults to `true`.
   */
  operableFiles?: boolean;
  /**
   * Whether this surface accepts attachments and shows the "+" attach menu.
   * Default `true`. A start surface whose submit ignores attachments (the
   * welcome screen, which uses a separate reference tray) passes `false`, so
   * paste/drop cannot stage content that would be silently discarded.
   */
  attach?: boolean;
  /**
   * Ordered attachment/reference preferences. Feasibility still comes from the
   * active model, scratch binding, and trusted host adapters. Defaults to the
   * behavior-preserving policy; callers can opt into reference-first routing
   * without replacing source handlers.
   */
  resourcePolicy?: InputResourcePolicy.Config;
  /** Scratch capacity already claimed by another payload merged into this
   * turn (for example a first-turn template bundle). */
  scratchReservation?: ScratchSeedBudget.Reservation;
  /**
   * Allows a submit with empty text/files when the host has out-of-band context
   * to attach to the turn.
   */
  allowEmptySubmit?: boolean;
  /** Left-aligned footer content (e.g. the model picker). */
  toolbar?: ReactNode;
  className?: string;
};

export function AgentComposerInput({
  catalog,
  commandActions,
  ...rest
}: AgentComposerInputProps) {
  // Surface action commands in the `/` menu alongside catalog commands.
  const effectiveCatalog = useMemo<ComposerCatalog>(() => {
    if (!commandActions || commandActions.length === 0) return catalog;
    const actionCommands = commandActions.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
    }));
    return {
      commands: [...actionCommands, ...catalog.commands],
      mentions: catalog.mentions,
    };
  }, [catalog, commandActions]);

  return (
    <ComposerProvider catalog={effectiveCatalog}>
      <AgentComposerInner commandActions={commandActions} {...rest} />
    </ComposerProvider>
  );
}

function AgentComposerInner({
  commandActions,
  onSubmit,
  isStreaming,
  busy,
  onStop,
  placeholder = "Ask anything…",
  autofocus,
  providerFileMimes = NO_PROVIDER_FILE_MIMES,
  providerUrlFileMimes = NO_PROVIDER_FILE_MIMES,
  operableFiles = true,
  attach = true,
  resourcePolicy = InputResourcePolicy.CURRENT,
  scratchReservation = ScratchSeedBudget.NONE,
  allowEmptySubmit = false,
  toolbar,
  className,
}: Omit<AgentComposerInputProps, "catalog">) {
  // The image-block gate must match the queue controller's enqueue decision,
  // which keys off the combined busy signal — not just this client's stream.
  // Fall back to `isStreaming` if the host doesn't pass `busy`.
  const isBusy = busy ?? isStreaming;
  const composer = useComposer();
  const { addAttachment } = composer;
  const desktopBridge = useDesktopBridge();

  const actionById = useMemo(() => {
    const map = new Map<string, ComposerCommandAction>();
    for (const a of commandActions ?? []) map.set(a.id, a);
    return map;
  }, [commandActions]);

  // In-flight file encoding (image downscale OR base64 of an operable upload).
  // Tracked through a ref (read synchronously by `submit`, which races the async
  // resource preparation) and mirrored to state (to disable the send button).
  // A counter, not a boolean, so queued picks don't clear it too early.
  const encodingCountRef = useRef(0);
  const [isEncodingFiles, setIsEncodingFiles] = useState(false);

  // Minimal, neutral inline feedback for the two cases that would otherwise do
  // nothing visible: a non-vision model, or attempting to queue images.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((msg: string | null) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (msg) noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  const preparedResources = useRef(new PreparedResourceLedger());
  const preparationTail = useRef<Promise<void>>(Promise.resolve());
  const resourceSequence = useRef(0);
  const nextResourceId = useCallback((source: string) => {
    resourceSequence.current += 1;
    return `${source}-${resourceSequence.current}`;
  }, []);

  // Feasibility is dynamic and separate from the selected preference policy.
  // In particular, a File from paste/drop/picker is bytes-only until a trusted
  // file-scope contract exists; folders can use today's opaque directory scope.
  const attachDirectory = operableFiles
    ? desktopBridge?.agent.attach_directory
    : undefined;
  const scratchSeedBase64Supported =
    desktopAi.supportsScratchSeedBase64(desktopBridge);
  const resourceEnvironment = useMemo<InputResourceRouter.Environment>(
    () => ({
      // The runtime has path-aware filesystem tools but no general URL reader.
      reference: { path: true, url: false, attachDirectory },
      attachment: {
        provider: {
          inlineMimes: providerFileMimes,
          remoteUrlMimes: providerUrlFileMimes,
        },
        ...(operableFiles && scratchSeedBase64Supported
          ? {
              scratch: {
                maxFileBytes: OPERABLE_FILE_POLICY.maxBytes,
                maxFiles: OPERABLE_FILE_POLICY.maxFiles,
                maxTotalBytes: OPERABLE_FILE_POLICY.maxTotalBytes,
                reservation: scratchReservation,
              },
            }
          : {}),
      },
    }),
    [
      attachDirectory,
      scratchSeedBase64Supported,
      operableFiles,
      providerFileMimes,
      providerUrlFileMimes,
      scratchReservation,
    ]
  );

  // The card owns display only. The resource ledger, keyed by the stable card
  // id assigned by ComposerCore, owns the exact route and prepared body.
  const addPreparedResource = useCallback(
    (resource: InputResourceRouter.PreparedResource): boolean => {
      const attachment = addAttachment(InputResourceRouter.card(resource), {
        filter: () =>
          !resource.dedupeKey ||
          !preparedResources.current.hasDedupeKey(resource.dedupeKey),
      });
      if (!attachment) return false;
      preparedResources.current.bind(attachment.id, resource);
      return true;
    },
    [addAttachment]
  );

  // Reconcile defensive cleanup if the composer is cleared by a future owner.
  useEffect(() => {
    preparedResources.current.reconcile(
      composer.snapshot.attachments.map((attachment) => attachment.id)
    );
  }, [composer.snapshot.attachments]);

  const prepareResources = useCallback(
    async (inputs: InputResourceRouter.Input[]) => {
      if (inputs.length === 0) return;
      // Mark preparation in-flight before the first await so pick-then-Enter
      // cannot submit while a resource is still being materialized.
      encodingCountRef.current += 1;
      setIsEncodingFiles(true);
      const work = preparationTail.current.then(async () => {
        const results = await InputResourceRouter.prepareBatch(
          inputs,
          resourceEnvironment,
          resourcePolicy,
          preparedResources.current.all()
        );
        let added = 0;
        const failures: ResourcePreparationFailure[] = [];
        inputs.forEach((input, index) => {
          const result = results[index];
          if (!result) return;
          if (result.status === "accept") {
            if (addPreparedResource(result.resource)) added += 1;
          } else {
            failures.push({ input, reason: result.reason });
          }
        });
        notify(
          resourcePreparationNotice(failures, added, {
            folderReferencesEnabled: operableFiles,
            hasDesktopBridge: desktopBridge !== null,
          })
        );
      });
      preparationTail.current = work.catch(() => undefined);
      try {
        await work;
      } finally {
        encodingCountRef.current -= 1;
        if (encodingCountRef.current === 0) setIsEncodingFiles(false);
      }
    },
    [
      addPreparedResource,
      desktopBridge,
      notify,
      operableFiles,
      resourceEnvironment,
      resourcePolicy,
    ]
  );

  // Paste/drop retain gesture provenance in one ordered envelope. The generic
  // composer does no attachment policy; this agent adapter describes each raw
  // resource and sends it through the same configured router.
  const onTransfer = useCallback(
    (event: ComposerTransfer.Event) => {
      const inputs: InputResourceRouter.Input[] = [];
      for (const resource of event.resources) {
        if (resource.kind === "file") {
          inputs.push({
            kind: "browser-file",
            id: nextResourceId(event.source),
            source: event.source,
            file: resource.file,
          });
        } else if (event.source === "drop") {
          inputs.push({
            kind: "browser-directory",
            id: nextResourceId(event.source),
            source: event.source,
            directory: resource.file,
          });
        }
      }
      void prepareResources(inputs);
    },
    [nextResourceId, prepareResources]
  );

  // "+" upload feeds the same router with explicit picker provenance. The input
  // stays mounted as a sibling of the menu so selecting a file doesn't unmount
  // it mid-gesture.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const onUploadPicked = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      // Reset so re-picking the same file still fires `change`.
      e.target.value = "";
      if (files.length > 0) {
        void prepareResources(
          files.map((file) => ({
            kind: "browser-file",
            id: nextResourceId("picker"),
            source: "picker",
            file,
          }))
        );
      }
    },
    [nextResourceId, prepareResources]
  );

  const [libraryOpen, setLibraryOpen] = useState(false);
  const onLibraryPicked = useCallback(
    (pins: DesignLibraryPin[]) => {
      void prepareResources(
        pins.map((pin) => ({
          kind: "library-file",
          id: pin.id,
          source: "library",
          name: pin.title,
          mimeType: pin.mime,
          url: pin.url,
        }))
      );
    },
    [prepareResources]
  );

  const submit = () => {
    // Hold a submit while resource preparation is still in flight — otherwise a
    // pick-then-Enter races the async router and sends without the
    // attachment. Keep the editor content so the user can retry.
    if (encodingCountRef.current > 0) {
      notify("Still adding the file — one moment…");
      return;
    }
    // No blanket `isStreaming` early-return: submitting WHILE a turn streams is
    // how a TEXT message gets queued (RFC `queue`). Images are the exception —
    // the turn queue persists text only, so image sends need an idle session.
    // `allow_empty` mirrors the later `allowEmptySubmit` guard: without it the
    // composer core returns null for a blank editor and we'd bail here, before
    // that guard — so a picked-template start (payload on the handoff, not the
    // text) would be lost. Let the empty message through and gate below.
    const message = composer.submit({
      submitted_at: Date.now(),
      allow_empty: allowEmptySubmit,
    });
    if (!message) return;
    // Intercept action commands (`/compact`, …) — run them instead of
    // sending a normal turn.
    const actions = message.parts
      .filter((p) => p.type === "command")
      .map((p) => (p as { id: string }).id)
      .filter((id) => actionById.has(id));
    if (actions.length > 0) {
      preparedResources.current.clear();
      composer.clear();
      for (const id of actions) void actionById.get(id)!.run();
      return;
    }

    const selected = preparedResources.current.select(
      message.meta.attachments.map((attachment) => attachment.id)
    );
    if (selected.status === "missing") {
      notify("Attachments need to be added again before sending.");
      return;
    }
    const lowered = InputResourceRouter.lower(selected.resources, {
      provider: resourceEnvironment.attachment.provider,
      scratch: resourceEnvironment.attachment.scratch,
    });
    const blockingRejections = lowered.rejected.filter(
      (rejection) => rejection.reason !== "provider-capability-unavailable"
    );
    if (blockingRejections.length > 0) {
      notify(resourceLoweringNotice(blockingRejections));
      return;
    }
    const text = lowerPrompt(message, lowered.references);
    const hasOutOfBandResources =
      lowered.files.length > 0 || lowered.extras !== undefined;
    const droppedImages = lowered.rejected.some(
      (rejection) => rejection.reason === "provider-capability-unavailable"
    );
    if (!text.trim() && !hasOutOfBandResources && !allowEmptySubmit) {
      if (droppedImages) {
        notify(
          "Direct image attachment isn't available for the selected model/provider."
        );
      }
      return;
    }
    // Provider files, scratch uploads, and registered directory contexts cannot
    // ride the text-only queue. Path/URL references can: they are honestly
    // lowered into the queued prompt text.
    // block on the combined busy signal (streaming OR compaction OR core-busy) —
    // the queue controller would enqueue text only and silently drop them. Don't
    // clear, so the user keeps their attachments until the session is idle.
    if (isBusy && hasOutOfBandResources) {
      notify(
        "Can't send attachments while the session is busy — wait until it's idle."
      );
      return;
    }
    preparedResources.current.clear();
    composer.clear();
    // Text still sends; if undeclared provider attachments were stripped, say
    // so rather than dropping them silently. Otherwise clear any stale notice.
    notify(
      droppedImages
        ? "Images weren't sent — direct attachment isn't available for the selected model/provider."
        : null
    );
    void onSubmit(
      text,
      lowered.files.length > 0 ? lowered.files : undefined,
      lowered.extras
    );
  };

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-accent transition-colors",
        className
      )}
    >
      <ComposerTriggerMenu />
      <ComposerAttachmentCards
        className="px-3 pt-2"
        onRemoveAttachment={(attachment) =>
          preparedResources.current.remove(attachment.id)
        }
      />
      <ComposerContent
        autofocus={autofocus}
        onSubmitRequest={submit}
        onTransfer={attach ? onTransfer : undefined}
        placeholder={placeholder}
        className="px-3 pt-2"
        editorClassName="min-h-9 max-h-48 overflow-y-auto text-sm"
      />
      {notice && (
        <p className="px-3 pb-1 text-xs text-muted-foreground">{notice}</p>
      )}
      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        {/* "+" attach menu — pinned shrink-0 (like the send button) so the
            attach affordance is never culled as the composer narrows. The
            hidden file input is a sibling of the menu, not a child, so it
            stays mounted when the menu closes on select. No `accept` filter:
            the configured agent resource policy decides each route. */}
        {attach && (
          <div className="shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              tabIndex={-1}
              className="hidden"
              onChange={onUploadPicked}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="rounded-full text-muted-foreground"
                  aria-label="Add attachment"
                >
                  <PlusIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                <DropdownMenuItem onSelect={openUpload}>
                  <UploadIcon />
                  Add files or photos
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLibraryOpen(true)}>
                  <LibraryIcon />
                  Add from Library
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {/* The toolbar (pickers + context meter) rides a shrinkable,
            clipping track; the submit button sits outside it as shrink-0,
            so as the composer narrows the pickers truncate first and the
            most-important submit control is never culled. */}
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {toolbar}
        </div>
        <div className="shrink-0">
          {isStreaming ? (
            <Button
              type="button"
              size="icon-sm"
              className="rounded-full"
              onClick={onStop}
              aria-label="Stop"
            >
              <SquareIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon-sm"
              className="rounded-full"
              onClick={submit}
              disabled={isEncodingFiles}
              aria-label="Send"
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>
      <AgentLibraryAttachmentPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onAttach={onLibraryPicked}
      />
    </div>
  );
}

/**
 * Build the prompt text the agent receives. Starts from the composer's
 * plain text, then appends:
 *   - any referenced file paths (`@`-mentions / file-refs) as an explicit
 *     list so the agent can resolve them, and
 *   - any `/`-command (skill) requests as a hint so the agent loads the
 *     named skill via its `skill` tool.
 */
function lowerPrompt(
  message: ComposerMessage,
  references: readonly InputResourceRouter.Reference[] = []
): string {
  const workspacePaths = new Set<string>();
  const referencePaths = new Set<string>();
  const urls = new Map<string, string>();
  const skills = new Set<string>();
  for (const part of message.parts) {
    if (part.type === "mention" && part.target.path) {
      workspacePaths.add(part.target.path);
    } else if (part.type === "file-ref") {
      workspacePaths.add(part.ref.path);
    } else if (part.type === "command") {
      skills.add(part.id);
    }
  }
  for (const reference of references) {
    if (reference.kind === "path") {
      const paths =
        reference.space === "workspace" ? workspacePaths : referencePaths;
      paths.add(reference.path);
    } else {
      urls.set(reference.url, reference.name);
    }
  }
  const sections = [message.meta.text.trim()];
  if (workspacePaths.size > 0) {
    sections.push(
      `Referenced workspace files:\n${[...workspacePaths]
        .map((path) => `- ${path}`)
        .join("\n")}`
    );
  }
  if (referencePaths.size > 0) {
    sections.push(
      `Referenced external files:\n${[...referencePaths]
        .map((path) => `- ${path}`)
        .join("\n")}`
    );
  }
  if (urls.size > 0) {
    sections.push(
      `Referenced resources:\n${[...urls]
        .map(([url, name]) => `- ${name}: ${url}`)
        .join("\n")}`
    );
  }
  if (skills.size > 0) {
    sections.push(`Use these skills: ${[...skills].join(", ")}.`);
  }
  return sections.filter((s) => s.length > 0).join("\n\n");
}

type ResourcePreparationFailure = {
  input: InputResourceRouter.Input;
  reason: InputResourceRouter.PreparationFailure;
};

function resourcePreparationNotice(
  failures: readonly ResourcePreparationFailure[],
  added: number,
  options: {
    folderReferencesEnabled: boolean;
    hasDesktopBridge: boolean;
  }
): string | null {
  if (failures.length === 0) return null;
  const reasons = new Set(failures.map((failure) => failure.reason));
  const some = added > 0;

  if (reasons.size === 1 && reasons.has("provider-capability-unavailable")) {
    const libraryOnly = failures.every(
      (failure) => failure.input.kind === "library-file"
    );
    if (some) {
      return "Some images weren't added because direct attachment isn't available for the selected model/provider.";
    }
    return libraryOnly
      ? "Direct Library image attachment isn't available for the selected model/provider."
      : "Direct image attachment isn't available for the selected model/provider.";
  }
  if (reasons.size === 1 && reasons.has("scratch-unavailable")) {
    return some
      ? "Some files weren't added because this chat has no scratch space."
      : "This chat can only attach images.";
  }
  if (
    reasons.size === 1 &&
    reasons.has("reference-capability-unavailable") &&
    failures.every((failure) => failure.input.kind === "browser-directory")
  ) {
    if (!options.folderReferencesEnabled) {
      return some
        ? "Some folders weren't added because this chat can't attach folders."
        : "This chat can't attach folders.";
    }
    if (!options.hasDesktopBridge) {
      return some
        ? "Some folders weren't added because folder references require Grida Desktop."
        : "Folder references require Grida Desktop.";
    }
    return some
      ? "Some folders weren't added because references aren't available."
      : "Folder references aren't available in this Desktop version.";
  }
  if (
    reasons.size === 1 &&
    reasons.has("directory-reference-failed") &&
    failures.every((failure) => failure.input.kind === "browser-directory")
  ) {
    return some
      ? "Some folders weren't added because access couldn't be registered."
      : "Couldn't attach the folder — access couldn't be registered.";
  }
  if (reasons.size === 1 && reasons.has("file-too-large")) {
    return some
      ? "Some files weren't added because they're too large."
      : "Couldn't add the file — it's too large.";
  }
  if (reasons.size === 1 && reasons.has("scratch-file-count-exceeded")) {
    return some
      ? "Some files weren't added because this turn already has too many scratch files."
      : "Too many files for one turn — add fewer and try again.";
  }
  if (reasons.size === 1 && reasons.has("scratch-budget-exceeded")) {
    return some
      ? "Some files weren't added because this turn's scratch budget is full."
      : "These files exceed this turn's scratch budget — add fewer and try again.";
  }
  if (reasons.size === 1 && reasons.has("representation-unavailable")) {
    return some
      ? "Some items weren't added because their format isn't supported."
      : "These items can't be attached with the current policy.";
  }
  return some
    ? "Some attachments couldn't be added."
    : "Couldn't add the attachment — it may be unavailable or unreadable.";
}

function resourceLoweringNotice(
  rejections: readonly InputResourceRouter.Lowered["rejected"][number][]
): string {
  const reasons = new Set(rejections.map((rejection) => rejection.reason));
  if (reasons.has("scratch-file-count-exceeded")) {
    return "Too many attached files for one turn — remove some and try again.";
  }
  if (reasons.has("scratch-budget-exceeded")) {
    return "Attached files exceed this turn's scratch budget — remove some and try again.";
  }
  if (reasons.has("scratch-unavailable")) {
    return "These files need scratch space, which isn't available in this chat.";
  }
  if (reasons.has("file-too-large")) {
    return "An attached file is too large — remove it and try again.";
  }
  return "Attachments need to be added again before sending.";
}
