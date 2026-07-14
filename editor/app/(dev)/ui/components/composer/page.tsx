"use client";

import { Button } from "@app/ui/components/button";
import { ArrowUpIcon, PlusIcon } from "lucide-react";
import {
  type DragEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ComposerAttachmentCards,
  type ComposerController,
  ComposerContent,
  ComposerProvider,
  ComposerTriggerMenu,
  useComposer,
  type ComposerAttachment,
  type ComposerMessage,
} from "@/kits/composer";
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

export default function ComposerPage() {
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
    <main className="flex h-[100svh] w-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <h1 className="font-semibold text-2xl">Composer</h1>
        <p className="text-muted-foreground text-sm">
          Demo for the reusable Tiptap prompt composer kit.
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 flex-col border-r border-border">
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
        </section>

        <FileSidebar
          dropMode={dropMode}
          selectedItem={selectedItem}
          selectedItemId={selectedItemId}
          setDropMode={setDropMode}
          setSelectedItemId={setSelectedItemId}
        />
      </div>
    </main>
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
  return (
    <div className="shrink-0 p-4 pt-0">
      <div
        className={`relative rounded-lg border bg-background transition-colors ${
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
      >
        <ComposerTriggerMenu />
        <ComposerAttachmentCards
          className="px-2 pt-2"
          onRemoveAttachment={onRemoveAttachment}
        />
        <ComposerContent
          autofocus
          onSubmitRequest={() => onSubmit()}
          placeholder="Type / for commands"
        />
        <ComposerFooter
          addLocalFiles={addLocalFiles}
          fileInputRef={fileInputRef}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}

function ComposerFooter({
  addLocalFiles,
  fileInputRef,
  onSubmit,
}: {
  addLocalFiles: (files: FileList | File[]) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center gap-1 px-2 pb-2 pt-0">
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
      <ToolbarButton
        label="Add file"
        onClick={() => fileInputRef.current?.click()}
      >
        <PlusIcon className="size-4" />
      </ToolbarButton>
      <Button
        aria-label="Submit"
        className="ml-auto rounded-full"
        onClick={() => onSubmit()}
        size="icon-sm"
        type="button"
      >
        <ArrowUpIcon className="size-4" />
      </Button>
    </div>
  );
}

function ToolbarButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex size-6 items-center justify-center rounded-md hover:bg-muted"
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      title={label}
      type="button"
    >
      {children}
    </button>
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
