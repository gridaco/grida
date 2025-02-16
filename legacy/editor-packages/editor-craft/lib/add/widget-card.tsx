import React from "react";
import { widget_production_stage } from "../k";
import { WidgetIcon } from "./widget-icon";
import { widgets, type WidgetType } from "../widgets";
export const WidgetCard = React.forwardRef(function WidgetCard(
  {
    value,
    label,
    ...props
  }: React.HTMLAttributes<HTMLButtonElement> & {
    value: WidgetType;
    label?: string;
  },
  ref: React.Ref<HTMLButtonElement>
) {
  const badge = widget_production_stage_label[widget_production_stage[value]];
  return (
    <button
      ref={ref}
      // style={style}
      // {...listeners}
      // {...attributes}
      className="relative w-40 h-40 flex flex-col gap-4 justify-center items-center hover:bg-white/10 p-2 rounded"
      {...props}
    >
      {badge && (
        <span
          className="absolute top-2 right-2 px-1 py-1/2 rounded text-[8px] font-bold uppercase"
          style={{
            backgroundColor: badge[1],
            color: "black",
          }}
        >
          {badge[0]}
        </span>
      )}
      <WidgetIcon name={value} />
      {label && <span className="text-sm">{label}</span>}
    </button>
  );
});

const widget_production_stage_label = {
  prod: null,
  beta: ["Beta", "skyblue"],
  soon: ["Soon", "orange"],
  hidden: "",
} as const;
