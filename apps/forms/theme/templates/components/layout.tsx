import React from "react";

interface LayoutProps {
  display: "flex" | "grid";
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gap?: string;
  flexDirection?: "row" | "column";
  flexWrap?: "wrap" | "nowrap";
  justifyContent?:
    | "center"
    | "start"
    | "end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  alignItems?: "center" | "start" | "end" | "stretch" | "baseline";
}

export function Layout({
  children,
  ...props
}: React.PropsWithChildren<LayoutProps>) {
  return (
    <div
      style={{
        display: props.display,
        gridTemplateColumns: props.gridTemplateColumns,
        gridTemplateRows: props.gridTemplateRows,
        gap: props.gap,
        flexDirection: props.flexDirection,
        flexWrap: props.flexWrap,
        justifyContent: props.justifyContent,
        alignItems: props.alignItems,
      }}
    >
      {children}
    </div>
  );
}
