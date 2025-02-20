import React, { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { WidgetCard } from "./widget-card";
import { WidgetType } from "../widgets";
/**
 * this is a widget dnd context provider, where users can drag and drop widgets from library to hierarchy or canvas.
 * this should be placed higher order prior to canvas and hierarchy components.
 * @returns
 */
export function CraftAddWidgetDndContextProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const [activeInfo, setActiveInfo] =
    useState<{
      id: string;
      widget: WidgetType;
    } | null>(null);

  function handleDragStart(event) {
    const id = event.active.id;
    const data = event.active.data.current;
    setActiveInfo({ id, widget: data.widget });
  }

  function handleDragEnd() {
    setActiveInfo(null);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <DragOverlay>
        {activeInfo ? <OverlayItem {...activeInfo} /> : null}
      </DragOverlay>
      {children}
    </DndContext>
  );
}

function OverlayItem({ widget }: { widget: WidgetType }) {
  // const [key, label] = widgets[widget];
  return (
    <WidgetCard
      value={widget}
      style={{
        background: "rgba(0, 0, 0, 0.5)",
      }}
    />
  );
}
