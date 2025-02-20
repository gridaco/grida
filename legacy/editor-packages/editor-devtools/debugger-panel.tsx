import React from "react";
import { WidgetTree } from "./components/visualization/json-visualization/json-tree";

export const Debugger = ({
  id,
  file,
  type,
  entry,
  widget,
  controls,
}: {
  type: string;
  id: string;
  file: string;
  entry: any;
  widget: any;
  controls: React.ReactNode;
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
      }}
    >
      <div style={{ flex: 1 }}>{controls}</div>

      <div style={{ flex: 2 }}>
        <WidgetTree data={entry} />
      </div>
      <div style={{ flex: 2 }}>
        <WidgetTree data={widget} />
      </div>
    </div>
  );
};
