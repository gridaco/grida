"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { usePanelRef } from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@app/ui/components/resizable";

export function SlideSidebar({
  slides,
  layers,
  defaultLayersSize = "40%",
  minLayersSize = "10%",
  layersCollapsible = false,
}: {
  slides: ReactNode;
  layers: ReactNode;
  defaultLayersSize?: string;
  minLayersSize?: string;
  layersCollapsible?: boolean;
}) {
  const layersPanel = usePanelRef();
  const layersId = useId();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
      <ResizablePanel minSize="20%">{slides}</ResizablePanel>
      <ResizableHandle aria-label="Resize slides and layers" />
      <ResizablePanel
        panelRef={layersPanel}
        defaultSize={defaultLayersSize}
        minSize={minLayersSize}
        collapsible={layersCollapsible}
        collapsedSize={layersCollapsible ? "1.75rem" : undefined}
        groupResizeBehavior={
          layersCollapsible ? "preserve-pixel-size" : undefined
        }
        onResize={
          layersCollapsible
            ? () => setCollapsed(layersPanel.current?.isCollapsed() ?? false)
            : undefined
        }
      >
        <div className="flex h-full min-h-0 flex-col">
          <h2 className="shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {layersCollapsible ? (
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-controls={layersId}
                onClick={() => {
                  const panel = layersPanel.current;
                  if (panel?.isCollapsed()) panel.expand();
                  else panel?.collapse();
                }}
                className="group flex h-7 w-full items-center gap-1.5 px-3 text-left hover:bg-muted focus-visible:outline-ring focus-visible:-outline-offset-2"
              >
                <ChevronDown
                  aria-hidden
                  className="size-3 shrink-0 group-aria-[expanded=false]:-rotate-90"
                />
                Layers
              </button>
            ) : (
              <span className="block px-4 pt-2 pb-1">Layers</span>
            )}
          </h2>
          <div
            id={layersId}
            hidden={collapsed}
            className="min-h-0 flex-1 overflow-auto px-2 pb-2"
          >
            {layers}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
