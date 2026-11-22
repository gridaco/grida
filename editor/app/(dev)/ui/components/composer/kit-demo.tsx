"use client";

import { Button } from "@app/ui/components/button";
import { isDesktopVoiceReady } from "@grida/desktop-bridge";
import {
  ArrowUpIcon,
  LoaderCircleIcon,
  MicIcon,
  SquareIcon,
} from "lucide-react";
import {
  type DragEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ComposerAttachmentCards,
  type ComposerController,
  ComposerContent,
  ComposerActionMenu,
  ComposerMenuAnchor,
  ComposerProvider,
  ComposerTriggerMenu,
  useComposer,
  type ComposerAttachment,
  type ComposerMessage,
} from "@/kits/composer";
import {
  DictationActivity,
  DictationButton,
  useComposerVoice,
} from "@/scaffolds/desktop/shared/composer-dictation-controls";
import {
  demoAttachmentFilters,
  demoCatalog,
  mockFileDragType,
  readMockItem,
  resolveDropMode,
  sidebarItems,
  toAttachment,
  toFileReference,
  type DropMode,
  type MockItem,
} from "./demo-data";
import { FileSidebar } from "./demo-file-sidebar";
import { type DemoMessage, MessageLog } from "./demo-message-log";

export function ComposerKitDemo() {
  return (
    <ComposerProvider catalog={demoCatalog}>
      <ComposerDemo />
    </ComposerProvider>
  );
}

function ComposerDemo() {
  const composer = useComposer();
  const [selectedItemId, setSelectedItemId] = useState(sidebarItems[0].id);
  const [dropMode, setDropMode] = useState<DropMode>("auto");
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [isDraggingOverComposer, setIsDraggingOverComposer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrls = useRef<string[]>([]);

  const selectedItem = sidebarItems.find((item) => item.id === selectedItemId);

  const revokeTrackedObjectUrl = (url: string | undefined) => {
    if (!url || !objectUrls.current.includes(url)) return;
    URL.revokeObjectURL(url);
    objectUrls.current = objectUrls.current.filter((item) => item !== url);
  };

  const revokeTrackedObjectUrls = () => {
    for (const url of objectUrls.current) {
      URL.revokeObjectURL(url);
    }
    objectUrls.current = [];
  };

  useEffect(() => {
    return revokeTrackedObjectUrls;
  }, []);

  const submit = (readyMessage?: ComposerMessage | null) => {
    const message =
      readyMessage ?? composer.submit({ submitted_at: Date.now() });

    if (!message) return;
    setMessages((prev) =>
      prev.concat({ ...message, demo_id: `message-${prev.length + 1}` })
    );
    composer.clear();
    revokeTrackedObjectUrls();
  };

  const addLocalFiles = (fileList: FileList | File[]) => {
    for (const file of Array.from(fileList)) {
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      composer.addAttachment({
        name: file.name,
        mime: file.type,
        size: file.size,
        url,
      });
    }
  };

  const onComposerDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOverComposer(false);

    const payload = event.dataTransfer.getData(mockFileDragType);
    if (payload) {
      const item = readMockItem(payload);
      if (item) {
        applyDroppedItem(item, dropMode, composer);
        return;
      }
    }

    if (event.dataTransfer.files.length) {
      addLocalFiles(event.dataTransfer.files);
    }
  };

  return (
    <div className="grid h-[36rem] grid-cols-1 grid-rows-2 overflow-hidden rounded-xl border bg-background md:grid-cols-[minmax(0,1fr)_17rem] md:grid-rows-1">
      <div className="flex min-h-0 flex-col border-b border-border md:border-r md:border-b-0">
        <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
          <MessageLog messages={messages} />
          <DemoComposerInput
            addLocalFiles={addLocalFiles}
            fileInputRef={fileInputRef}
            isDraggingOverComposer={isDraggingOverComposer}
            onRemoveAttachment={(attachment) =>
              revokeTrackedObjectUrl(
                attachment.kind === "directory" ? undefined : attachment.url
              )
            }
            onDrop={onComposerDrop}
            onSubmit={submit}
            setIsDraggingOverComposer={setIsDraggingOverComposer}
          />
        </div>
      </div>

      <FileSidebar
        dropMode={dropMode}
        selectedItem={selectedItem}
        selectedItemId={selectedItemId}
        setDropMode={setDropMode}
        setSelectedItemId={setSelectedItemId}
      />
    </div>
  );
}

function DemoComposerInput({
  addLocalFiles,
  fileInputRef,
  isDraggingOverComposer,
  onRemoveAttachment,
  onDrop,
  onSubmit,
  setIsDraggingOverComposer,
}: {
  addLocalFiles: (files: FileList | File[]) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  isDraggingOverComposer: boolean;
  onRemoveAttachment: (attachment: ComposerAttachment) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onSubmit: (message?: ComposerMessage | null) => void;
  setIsDraggingOverComposer: (value: boolean) => void;
}) {
  const composer = useComposer();
  const { voice, state } = useComposerVoice();
  const phase = state.state.phase;
  const canStop = phase === "starting" || phase === "recording";
  const finishing = phase === "finishing";
  const showDictationProgress = finishing && !state.sendPending;

  function requestSubmit() {
    if (state.active) voice.stopAndSend(() => onSubmit());
    else onSubmit();
  }

  return (
    <div className="shrink-0 p-4 pt-0">
      <ComposerMenuAnchor
        className={`relative rounded-xl border bg-background transition-colors ${
          isDraggingOverComposer
            ? "border-primary bg-primary/5"
            : "border-border"
        }`}
        data-composer-dropzone
        onDragEnterCapture={(event) => {
          event.preventDefault();
          setIsDraggingOverComposer(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsDraggingOverComposer(false);
          }
        }}
        onDragOverCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDropCapture={onDrop}
        onKeyDownCapture={(event) => {
          if (
            !canStop ||
            event.key !== "Escape" ||
            event.defaultPrevented ||
            event.repeat ||
            event.nativeEvent.isComposing ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            composer.trigger ||
            (event.target instanceof Element &&
              event.target.closest("[data-composer-formatting]"))
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          voice.stop();
        }}
      >
        <ComposerTriggerMenu />
        <ComposerAttachmentCards
          className="px-2 pt-2"
          onRemoveAttachment={onRemoveAttachment}
        />
        <ComposerContent
          onSubmitRequest={requestSubmit}
          placeholder="Type / for commands"
        />
        {state.notice && (
          <p role="status" className="px-3 pb-1 text-xs text-muted-foreground">
            {state.notice.text}
          </p>
        )}
        <div className="flex items-center gap-1 px-2 pt-0 pb-2">
          <input
            className="hidden"
            multiple
            onChange={(event) => {
              if (event.currentTarget.files) {
                addLocalFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }
            }}
            ref={fileInputRef}
            type="file"
          />
          {state.active ? (
            <DictationActivity
              state={state.state}
              cancel={() => {
                voice.cancel();
                composer.focus();
              }}
            />
          ) : (
            <ComposerActionMenu
              items={[
                {
                  id: "files",
                  title: "Files",
                  description: "Attach a file from this device",
                  onSelect: () => fileInputRef.current?.click(),
                },
              ]}
            />
          )}
          <div className="ml-auto flex items-center gap-1">
            {isDesktopVoiceReady(state.settings) && (
              <DictationButton
                label={
                  showDictationProgress
                    ? "Transcribing…"
                    : state.active
                      ? "Stop dictation"
                      : "Dictate"
                }
                escapeShortcut={canStop}
                aria-disabled={finishing || undefined}
                className="aria-disabled:opacity-50"
                disabled={!state.active && !composer.ready}
                onClick={() => {
                  if (canStop) voice.stop();
                  else if (!state.active)
                    void voice.start(false, (text) =>
                      composer.appendText(
                        text,
                        Number.POSITIVE_INFINITY,
                        "inline"
                      )
                    );
                }}
              >
                {showDictationProgress ? (
                  <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                ) : state.active ? (
                  <SquareIcon className="size-3 fill-current" />
                ) : (
                  <MicIcon className="size-4" />
                )}
              </DictationButton>
            )}
            <Button
              aria-label={state.sendPending ? "Sending…" : "Submit"}
              aria-busy={state.sendPending || undefined}
              aria-disabled={
                state.sendPending || phase === "starting" || undefined
              }
              className="rounded-full"
              onClick={requestSubmit}
              size="icon-sm"
              type="button"
            >
              {state.sendPending ? (
                <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <ArrowUpIcon className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </ComposerMenuAnchor>
    </div>
  );
}

function applyDroppedItem(
  file: MockItem,
  mode: DropMode,
  composer: ComposerController
) {
  const resolved = resolveDropMode(file, mode);
  if (
    resolved === "inline" &&
    composer.insertFileReference(toFileReference(file))
  ) {
    return;
  }
  composer.addAttachment(toAttachment(file), {
    filter: demoAttachmentFilters.byReference,
  });
}
