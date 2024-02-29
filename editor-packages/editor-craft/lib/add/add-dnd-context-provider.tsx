import React, { useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
/**
 * this is a widget dnd context provider, where users can drag and drop widgets from library to hierarchy or canvas.
 * this should be placed higher order prior to canvas and hierarchy components.
 * @returns
 */
export function CraftAddWidgetDndContextProvider({
  children,
}: React.PropsWithChildren<{}>) {
  // const [activeId, setActiveId] = useState(null);

  return (
    <DndContext>
      {/* <DragOverlay>{activeId ? <OverlayItem /> : null}</DragOverlay> */}
      {children}
    </DndContext>
  );
}

function OverlayItem() {
  return (
    <div className="absolute z-50 w-32 h-32 bg-white border border-gray-200 shadow-lg" />
  );
}
