import React from "react";

export function FlexWidget({
  children,
  style,
}: React.PropsWithChildren<{
  style?: React.CSSProperties;
}>) {
  return (
    <div
      data-widget="flex"
      style={{
        display: "flex",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

FlexWidget.type = "flex";
