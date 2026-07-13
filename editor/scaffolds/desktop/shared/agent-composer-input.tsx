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
import type { DirectoryScopeDescriptor } from "@grida/agent";
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
  ComposerTriggerMenu,
  useComposer,
  type ComposerCatalog,
  type ComposerMessage,
} from "@/kits/composer";
import {
  AgentDirectoryReference,
  encodeImageFile,
  extractOperableFiles,
  isSupportedImageType,
  readFileAsBase64,
  toFileUiParts,
  type SendExtras,
} from "@/lib/agent-chat";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { AgentLibraryAttachmentPicker } from "./agent-library-attachment-picker";
import type { DesignLibraryPin } from "./design-search";

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
   * Whether the active model accepts image input. When false, pasted/dropped
   * images are rejected at ingest (with a notice) and stripped at submit.
   * Defaults to `true`.
   */
  multimodal?: boolean;
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
  multimodal = true,
  operableFiles = true,
  attach = true,
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

  const actionById = useMemo(() => {
    const map = new Map<string, ComposerCommandAction>();
    for (const a of commandActions ?? []) map.set(a.id, a);
    return map;
  }, [commandActions]);

  // In-flight file encoding (image downscale OR base64 of an operable upload).
  // Tracked through a ref (read synchronously by `submit`, which races the async
  // `onFiles`) and mirrored to state (to disable the send button). A counter, not
  // a boolean, so concurrent picks don't clear the flag while another runs.
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

  // Paste / drop / "+"-pick files. A supported raster image inlines as a
  // perceive-only attachment (the model sees pixels); EVERY other file (PDF,
  // zip, svg, …) is base64'd and marked operable — it rides `scratch_seed` into
  // the session scratch at submit, where the agent reads it BY PATH. The split
  // is by mime (`isSupportedImageType` → perceive; else → scratch upload).
  const onFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => isSupportedImageType(f.type));
      const others = files.filter((f) => !isSupportedImageType(f.type));
      // A non-vision model still takes operable uploads (read by tools, not
      // perceived) — only the image half is gated.
      if (images.length > 0 && !multimodal) {
        notify("This model can't read images.");
      }
      if (others.length > 0 && !operableFiles) {
        notify("This chat can only attach images.");
      }
      const perceivable = multimodal ? images : [];
      const operable = operableFiles ? others : [];
      // Mark encode in-flight BEFORE the first await so a pick-then-Enter can't
      // slip a submit past the still-encoding attachments (see `submit`).
      encodingCountRef.current += 1;
      setIsEncodingFiles(true);
      try {
        // Encode concurrently — each file is independent. `encodeImageFile` /
        // `readFileAsBase64` return null on failure/oversize (dropped below).
        const [encodedImages, encodedFiles] = await Promise.all([
          Promise.all(perceivable.map((file) => encodeImageFile(file))),
          Promise.all(operable.map((file) => readFileAsBase64(file))),
        ]);
        let added = 0;
        for (const item of encodedImages) {
          if (!item) continue;
          addAttachment({
            name: item.name,
            mime: item.mime,
            size: item.size,
            url: item.url,
          });
          added += 1;
        }
        for (const item of encodedFiles) {
          if (!item) continue;
          // Operable file: bytes ride in `payload.base64` (no `url`), so
          // `toFileUiParts` skips it and `extractOperableFiles` claims it.
          addAttachment({
            name: item.name,
            mime: item.mime,
            size: item.size,
            payload: { base64: item.base64 },
          });
          added += 1;
        }
        const attempted = perceivable.length + operable.length;
        if (added > 0) {
          // Keep the image-gate caveat when it applies; else clear stale notices.
          if (
            !(images.length > 0 && !multimodal) &&
            !(others.length > 0 && !operableFiles)
          ) {
            notify(null);
          }
        } else if (attempted > 0) {
          notify("Couldn't add the file — it may be too large or unreadable.");
        }
      } finally {
        encodingCountRef.current -= 1;
        if (encodingCountRef.current === 0) setIsEncodingFiles(false);
      }
    },
    [multimodal, operableFiles, addAttachment, notify]
  );

  // Folder drop → opaque, host-minted, read-only directory reference. The live
  // disk-backed File crosses the contextBridge into preload, where Electron
  // resolves its OS path and immediately exchanges it for a daemon descriptor;
  // this renderer never sees the absolute path and never enumerates/copies the
  // directory into scratch.
  const onDirectories = useCallback(
    async (directories: File[]) => {
      if (!operableFiles) {
        notify("This chat can't attach folders.");
        return;
      }
      const attachDirectory = getDesktopBridge()?.agent.attach_directory;
      if (!attachDirectory) {
        notify("Folder references require Grida Desktop.");
        return;
      }
      encodingCountRef.current += 1;
      setIsEncodingFiles(true);
      try {
        const attached = await Promise.allSettled(
          directories.map((directory) => attachDirectory(directory))
        );
        let added = 0;
        for (const result of attached) {
          if (result.status !== "fulfilled") continue;
          const ref: DirectoryScopeDescriptor = result.value;
          const attachment = addAttachment(
            {
              kind: "directory",
              name: ref.name,
              ref,
            },
            {
              filter: (incoming, existing) =>
                incoming.kind !== "directory" ||
                !existing.some(
                  (item) =>
                    item.kind === "directory" && item.ref.id === incoming.ref.id
                ),
            }
          );
          if (attachment) added += 1;
        }
        notify(
          added > 0
            ? null
            : "Couldn't add the folder — it may no longer be available."
        );
      } finally {
        encodingCountRef.current -= 1;
        if (encodingCountRef.current === 0) setIsEncodingFiles(false);
      }
    },
    [addAttachment, notify, operableFiles]
  );

  // "+" upload: a hidden file input feeding the same `onFiles` pipeline as
  // paste/drop (image → perceive, other → scratch upload). The input stays
  // mounted as a sibling of the menu so selecting a file doesn't unmount it
  // mid-gesture.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const onUploadPicked = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      // Reset so re-picking the same file still fires `change`.
      e.target.value = "";
      if (files.length > 0) void onFiles(files);
    },
    [onFiles]
  );

  const [libraryOpen, setLibraryOpen] = useState(false);
  const onLibraryPicked = useCallback(
    (pins: DesignLibraryPin[]) => {
      if (!multimodal) {
        notify("This model can't read Library images.");
        return;
      }
      let added = 0;
      let unsupported = 0;
      for (const pin of pins) {
        if (!isSupportedImageType(pin.mime)) {
          unsupported += 1;
          continue;
        }
        const attachment = addAttachment(
          {
            id: `library-${pin.id}`,
            name: pin.title,
            mime: pin.mime,
            url: pin.url,
            payload: { source: "library", id: pin.id },
          },
          {
            filter: (incoming, existing) =>
              incoming.kind === "directory" ||
              !existing.some(
                (item) =>
                  item.kind !== "directory" &&
                  item.payload?.source === "library" &&
                  item.payload.id === incoming.payload?.id
              ),
          }
        );
        if (attachment) added += 1;
      }
      if (unsupported > 0) {
        notify(
          added > 0
            ? "Some Library items weren't added because their format isn't supported."
            : "These Library items can't be attached to this model."
        );
      } else if (added > 0) {
        notify(null);
      }
    },
    [addAttachment, multimodal, notify]
  );

  const submit = () => {
    // Hold a submit while file encoding is still in flight — otherwise a
    // pick-then-Enter races the async `onFiles` and sends without the
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
      composer.clear();
      for (const id of actions) void actionById.get(id)!.run();
      return;
    }
    const text = lowerPrompt(message);
    // Perceive-only image attachments; stripped when the model can't see them
    // (e.g. switched to a non-multimodal model after attaching).
    const images = toFileUiParts(message.parts);
    const files = multimodal ? images : [];
    const droppedImages = images.length > 0 && files.length === 0;
    // Operable (non-image) uploads → scratch bytes + a marker naming them for
    // the model (WG `scratch.md` / `binary.md`).
    const { scratchSeed, context } = extractOperableFiles(message.parts);
    const hasUploads = scratchSeed.length > 0;
    const directoryContext = AgentDirectoryReference.extract(message.parts);
    const hasDirectories = directoryContext !== null;
    const contexts = [context, directoryContext].filter(
      (item): item is NonNullable<typeof item> => item !== null
    );
    const extras: SendExtras | undefined =
      hasUploads || hasDirectories
        ? {
            ...(hasUploads ? { scratchSeed } : {}),
            contexts,
          }
        : undefined;
    if (
      !text.trim() &&
      files.length === 0 &&
      !hasUploads &&
      !hasDirectories &&
      !allowEmptySubmit
    ) {
      if (droppedImages) notify("This model can't read images.");
      return;
    }
    // Neither perceive images nor scratch uploads can ride the text-only queue:
    // block on the combined busy signal (streaming OR compaction OR core-busy) —
    // the queue controller would enqueue text only and silently drop them. Don't
    // clear, so the user keeps their attachments until the session is idle.
    if (isBusy && (files.length > 0 || hasUploads || hasDirectories)) {
      notify(
        "Can't send attachments while the session is busy — wait until it's idle."
      );
      return;
    }
    composer.clear();
    // Text still sends; if images were stripped (non-vision model) say so rather
    // than dropping them silently. Otherwise clear any stale notice.
    notify(
      droppedImages ? "Images weren't sent — this model can't read them." : null
    );
    void onSubmit(text, files.length > 0 ? files : undefined, extras);
  };

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-accent transition-colors",
        className
      )}
    >
      <ComposerTriggerMenu />
      <ComposerAttachmentCards className="px-3 pt-2" />
      <ComposerContent
        autofocus={autofocus}
        onSubmitRequest={submit}
        onFiles={attach ? onFiles : undefined}
        onDirectories={attach ? onDirectories : undefined}
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
            images inline (perceive), everything else rides scratch. */}
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
function lowerPrompt(message: ComposerMessage): string {
  const paths = new Set<string>();
  const skills = new Set<string>();
  for (const part of message.parts) {
    if (part.type === "mention" && part.target.path) {
      paths.add(part.target.path);
    } else if (part.type === "file-ref") {
      paths.add(part.ref.path);
    } else if (part.type === "command") {
      skills.add(part.id);
    }
  }
  const sections = [message.meta.text.trim()];
  if (paths.size > 0) {
    sections.push(
      `Referenced files:\n${[...paths].map((p) => `- ${p}`).join("\n")}`
    );
  }
  if (skills.size > 0) {
    sections.push(`Use these skills: ${[...skills].join(", ")}.`);
  }
  return sections.filter((s) => s.length > 0).join("\n\n");
}
