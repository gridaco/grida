"use client";

import * as React from "react";
import { useSyncExternalStore } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@app/ui/components/resizable";
import { HierarchyPanel } from "./hierarchy-panel";
import { useSvgDocStore } from "../_storage/context";

/**
 * Sidebar body for the multi-doc SVG editor. Two resizable stacked
 * sections: a label-only "Documents" list + the standard Layers panel
 * for the active doc. No thumbnails — the canvas doc isn't constrained
 * to a known aspect ratio, and a useful preview would need to know one.
 * (Slide-shaped previews live in `slides-nav.tsx`, which IS contracted
 * to 16:9.) What label to surface here is an open question — for now we
 * fall back on the auto-assigned name.
 */
export function DocsNav() {
  const store = useSvgDocStore();
  const docs = useSyncExternalStore(
    store.subscribe,
    store.getDocs,
    store.getDocs
  );
  const activeId = useSyncExternalStore(
    store.subscribe,
    store.getActiveId,
    store.getActiveId
  );

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const activeIndex = docs.findIndex((d) => d.id === activeId);

  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (activeIndex < 0) return;
    let next: number;
    switch (e.key) {
      case "ArrowDown":
        next = Math.min(docs.length - 1, activeIndex + 1);
        break;
      case "ArrowUp":
        next = Math.max(0, activeIndex - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = docs.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    if (next === activeIndex) return;
    store.setActiveId(docs[next].id);
  };

  return (
    <ResizablePanelGroup orientation="vertical" className="flex-1">
      <ResizablePanel defaultSize={40} minSize={15}>
        <div className="h-full flex flex-col min-h-0">
          <div className="px-3 pt-2 pb-2 shrink-0 border-b border-border flex items-center justify-between">
            <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Documents
            </h2>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => store.appendDoc()}
              title="New document"
              aria-label="New document"
            >
              <Plus />
            </Button>
          </div>
          <div
            ref={listRef}
            tabIndex={0}
            role="listbox"
            aria-label="Documents"
            aria-activedescendant={
              activeIndex >= 0 ? `docs-nav-row-${activeIndex}` : undefined
            }
            onKeyDown={onListKeyDown}
            className="flex-1 overflow-auto py-1 outline-none"
          >
            {docs.map((d, i) => (
              <div
                key={d.id}
                id={`docs-nav-row-${i}`}
                role="option"
                aria-selected={d.id === activeId}
                onClick={() => store.setActiveId(d.id)}
                className={cn(
                  "group flex items-center justify-between gap-2 px-3 py-1.5 text-xs cursor-pointer select-none outline-none",
                  d.id === activeId
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                )}
              >
                <span className="truncate flex-1 min-w-0">{d.name}</span>
                {docs.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      store.removeDoc(d.id);
                    }}
                    title="Remove document"
                    aria-label="Remove document"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={60} minSize={10}>
        <div className="h-full flex flex-col min-h-0">
          <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 pt-2 pb-1 shrink-0">
            Layers
          </h2>
          <div className="flex-1 overflow-auto px-2 pb-2 min-h-0">
            <HierarchyPanel />
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
