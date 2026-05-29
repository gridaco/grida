"use client";

import { FileIcon, FolderIcon } from "lucide-react";
import Image from "next/image";
import {
  isImageFile,
  mockFileDragType,
  resolveDropMode,
  sidebarItems,
  type DropMode,
  type MockItem,
} from "./demo-data";

export function FileSidebar({
  dropMode,
  selectedItem,
  selectedItemId,
  setDropMode,
  setSelectedItemId,
}: {
  dropMode: DropMode;
  selectedItem: MockItem | undefined;
  selectedItemId: string;
  setDropMode: (mode: DropMode) => void;
  setSelectedItemId: (id: string) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden bg-muted/20 p-4">
      <h2 className="mb-3 font-semibold text-sm">Public files</h2>
      <div className="mb-4 rounded-md border border-border bg-background p-2">
        <div className="mb-2 px-1 font-medium text-xs">Drop as</div>
        <div className="grid grid-cols-3 gap-1">
          <DropModeButton
            active={dropMode === "auto"}
            label="Auto"
            onClick={() => setDropMode("auto")}
          />
          <DropModeButton
            active={dropMode === "inline"}
            label="Ref"
            onClick={() => setDropMode("inline")}
          />
          <DropModeButton
            active={dropMode === "card"}
            label="Card"
            onClick={() => setDropMode("card")}
          />
        </div>
        <p className="mt-2 px-1 text-muted-foreground text-xs">
          Auto drops images as cards and other files as inline references.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
        {groupItems(sidebarItems).map(([folder, group]) => (
          <FileGroup
            folder={folder}
            items={group}
            key={folder}
            selectedItemId={selectedItemId}
            setSelectedItemId={setSelectedItemId}
          />
        ))}
      </div>

      {selectedItem && (
        <div className="mt-4 rounded-md border border-border bg-background p-3">
          <div>
            <div className="font-medium text-sm">{selectedItem.name}</div>
            <div className="truncate text-muted-foreground text-xs">
              {selectedItem.path}
            </div>
          </div>
          <div className="mt-2 text-muted-foreground text-xs">
            Drag this {selectedItem.kind} into the composer. Current target:{" "}
            {resolveDropModeLabel(selectedItem, dropMode)}.
          </div>
        </div>
      )}
    </aside>
  );
}

function FileGroup({
  folder,
  items,
  selectedItemId,
  setSelectedItemId,
}: {
  folder: string;
  items: MockItem[];
  selectedItemId: string;
  setSelectedItemId: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-muted-foreground text-xs">
        <FolderIcon className="size-3.5" />
        <span className="truncate">{folder}</span>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <FileListItem
            item={item}
            key={item.id}
            selected={selectedItemId === item.id}
            setSelectedItemId={setSelectedItemId}
          />
        ))}
      </div>
    </div>
  );
}

function FileListItem({
  item,
  selected,
  setSelectedItemId,
}: {
  item: MockItem;
  selected: boolean;
  setSelectedItemId: (id: string) => void;
}) {
  return (
    <button
      className={`w-full cursor-grab rounded-md border px-3 py-2 text-left text-sm active:cursor-grabbing ${
        selected
          ? "border-primary bg-background"
          : "border-border bg-background/60 hover:bg-background"
      }`}
      draggable
      onClick={() => setSelectedItemId(item.id)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(mockFileDragType, JSON.stringify(item));
        event.dataTransfer.setData("text/plain", item.path);
      }}
      type="button"
    >
      <span className="flex items-center gap-2">
        {isImageFile(item) && item.publicPath ? (
          <Image
            alt=""
            className="size-6 shrink-0 rounded object-cover"
            height={24}
            src={item.publicPath}
            unoptimized
            width={24}
          />
        ) : (
          <ItemIcon item={item} />
        )}
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
      </span>
      <span className="mt-1 block truncate text-muted-foreground text-xs">
        {item.path}
      </span>
    </button>
  );
}

function DropModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`rounded px-2 py-1.5 text-xs ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function ItemIcon({ item }: { item: MockItem }) {
  if (item.kind === "folder") {
    return <FolderIcon className="size-4 text-muted-foreground" />;
  }
  return <FileIcon className="size-4 text-muted-foreground" />;
}

function groupItems(items: MockItem[]): [string, MockItem[]][] {
  const groups = new Map<string, MockItem[]>();
  for (const item of items) {
    groups.set(item.folder, (groups.get(item.folder) ?? []).concat(item));
  }
  return Array.from(groups.entries());
}

function resolveDropModeLabel(file: MockItem, mode: DropMode): string {
  if (resolveDropMode(file, mode) === "card") {
    return "card attachment";
  }
  return "inline file reference";
}
