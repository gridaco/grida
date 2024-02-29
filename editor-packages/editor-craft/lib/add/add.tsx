import * as Popover from "@radix-ui/react-popover";
import React, { useMemo, useState } from "react";
import { WidgetType, widgets } from "../widgets";
import { widget_production_stage } from "../k";
import { PlusIcon } from "@radix-ui/react-icons";
import { WidgetCard } from "./widget-card";

export function CraftAddButton({
  onAddWidget,
}: {
  onAddWidget?: (widget: WidgetType) => void;
}) {
  const [search, setSearch] = useState("");

  const display_widgets = useMemo(() => {
    return widgets
      .filter(([key, label]) => {
        return label.toLowerCase().includes(search.toLowerCase());
      })
      .filter(([key, label]) => {
        // filter out hidden widgets
        return widget_production_stage[key] !== "hidden";
      })
      .sort((a, b) => {
        // sort by widget_production_stage_priority
        const a_priority =
          widget_production_stage_priority[widget_production_stage[a[0]]];
        const b_priority =
          widget_production_stage_priority[widget_production_stage[b[0]]];
        return a_priority - b_priority;
      });
  }, [search]);

  const handleAddWidget = (widget: WidgetType) => {
    onAddWidget?.(widget);
  };

  return (
    <Popover.Root
      onOpenChange={() => {
        setSearch("");
      }}
    >
      <Popover.Trigger asChild>
        <button className="px-4 py-2 flex justify-center items-center gap-2 bg-transparent text-white border-none">
          <PlusIcon />
          Add
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          className="bg-neutral-800 z-30 elevated rounded-md shadow-md border border-white/10"
        >
          <div className="relative px-4 py-4 pt-0 w-96 max-h-[80vh] overflow-y-scroll">
            <div className="sticky top-0 pt-4 bg-neutral-800 z-10">
              <input
                autoFocus
                type="search"
                placeholder="🔎 Search"
                onChange={(e) => setSearch(e.target.value)}
                className="p-2 w-full rounded bg-transparent text-white"
              />
            </div>
            <div className="w-full flex flex-wrap gap-2 justify-center items-center">
              {display_widgets.map(([key, label]) => (
                <WidgetCard
                  key={key}
                  value={key}
                  label={label}
                  onClick={() => {
                    console.log("craft: add new node", key);
                    handleAddWidget(key);
                  }}
                />
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
const widget_production_stage_priority = {
  prod: 0,
  beta: 1,
  soon: 2,
  hidden: 3,
} as const;
