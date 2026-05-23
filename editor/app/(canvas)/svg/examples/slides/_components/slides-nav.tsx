"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { HierarchyPanel } from "../../../_components/hierarchy-panel";
import { SlideListFocusScope, SlideRow } from "./slide-row";
import { TemplatePicker } from "./template-picker";
import type { SlidePage } from "./types";
import type { SlideTemplate } from "./templates";

/**
 * Sidebar body for the Slides demo. Two resizable stacked sections:
 *
 *   - **Pages**: header + plus button, scrollable thumbnail list. Multi-page
 *     state lives in the demo (not the editor) — each entry is one SVG
 *     document. The active page's SVG is what's currently mounted in the
 *     editor; switching pages serializes the current edit back to its
 *     entry and loads the new page's source.
 *   - **Layers**: standard hierarchy panel of the active page.
 *
 * Wrapped in `SlideListFocusScope` so `:focus-within` lights up the strong
 * accent tier on the selected row when the sidebar is focused.
 */
export function SlidesNav({
  docs,
  activeId,
  onAdd,
  onAddFromTemplate,
  onSelect,
  onRemove,
}: {
  docs: readonly SlidePage[];
  activeId: string | null;
  onAdd: () => void;
  onAddFromTemplate: (tpl: SlideTemplate) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const scrollRef = useScrollMemory("slides-nav");
  // Stable prefix (not useId) — the SvgEditorProvider remounts the whole
  // sidebar on every slide switch, so useId() would produce a new value each
  // mount and stale `aria-activedescendant` refs.
  const listId = "slides-nav-row";
  const activeIndex = docs.findIndex((p) => p.id === activeId);

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
    onSelect(docs[next].id);
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector<HTMLElement>(
        '[data-slide-row][data-selected="true"]'
      );
      el?.scrollIntoView({ block: "nearest" });
    });
  };

  // `preventScroll`: without it, focusing the container jumps it to the row.
  const handleRowClick = (id: string) => {
    onSelect(id);
    scrollRef.current?.focus({ preventScroll: true });
  };

  return (
    <SlideListFocusScope className="h-full">
      <ResizablePanelGroup orientation="vertical" className="flex-1">
        <ResizablePanel defaultSize={60} minSize={20}>
          <div className="h-full flex flex-col min-h-0">
            <div className="px-3 pt-2 pb-2 shrink-0 border-b border-border">
              <ButtonGroup className="w-full">
                <TemplatePicker
                  onPick={onAddFromTemplate}
                  onPickAll={(tpls) => tpls.forEach(onAddFromTemplate)}
                  triggerClassName="flex-1 justify-center"
                />
                <Button
                  variant="outline"
                  size="icon-xs"
                  className="shrink-0"
                  onClick={onAdd}
                  title="Insert empty slide"
                  aria-label="Insert empty slide"
                >
                  <Plus />
                </Button>
              </ButtonGroup>
            </div>
            <div
              ref={scrollRef}
              tabIndex={0}
              role="listbox"
              aria-label="Slides"
              aria-activedescendant={
                activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
              }
              onKeyDown={onListKeyDown}
              className="flex-1 overflow-auto px-1 pt-1 pb-2 outline-none"
            >
              {docs.map((p, i) => (
                <SlideRow
                  key={p.id}
                  id={`${listId}-${i}`}
                  index={i + 1}
                  selected={p.id === activeId}
                  aspectRatio="16 / 9"
                  thumbnailSrc={p.thumbnailDataUri}
                  label={p.name}
                  onClick={() => handleRowClick(p.id)}
                  actions={
                    docs.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(p.id);
                        }}
                        title="Remove page"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    ) : null
                  }
                />
              ))}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={40} minSize={10}>
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
    </SlideListFocusScope>
  );
}

/**
 * Persist scroll position AND focus state of a container across React
 * remounts.
 *
 * The slides demo wraps the editor (and this sidebar) in a provider keyed
 * by the active slide id — so every selection unmounts and remounts the
 * entire subtree. Without help, both scrollTop and document focus reset on
 * every keypress, breaking keyboard navigation (the second arrow key never
 * lands on our handler because the element holding focus was just torn
 * down). We mirror both bits into module-level maps and restore them in a
 * layout effect.
 */
const _scrollMemory = new Map<string, number>();
const _focusMemory = new Map<string, boolean>();
function useScrollMemory(key: string) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const savedScroll = _scrollMemory.get(key);
    if (savedScroll != null) el.scrollTop = savedScroll;
    if (_focusMemory.get(key)) el.focus({ preventScroll: true });
    const onScroll = () => {
      _scrollMemory.set(key, el.scrollTop);
    };
    const onFocus = () => {
      _focusMemory.set(key, true);
    };
    const onBlur = () => {
      _focusMemory.set(key, false);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("focus", onFocus);
    el.addEventListener("blur", onBlur);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("blur", onBlur);
    };
  }, [key]);
  return ref;
}
