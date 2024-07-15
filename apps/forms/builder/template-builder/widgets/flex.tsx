import React from "react";
import { withTemplate } from "../with-template";

export const FlexWidget = withTemplate(function FlexWidget({
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
}, "flex");
