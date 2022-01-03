import React from "react";
export function Canvas() {
  const scale = 1;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        willChange: "transform",
        transform: `scale(${scale}) translateX(0) translateY(0)`,
        isolation: "isolate",
      }}
    >
      <DisableBackdropFilter>Canvas</DisableBackdropFilter>
    </div>
  );
}

function DisableBackdropFilter({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        backdropFilter: "none!important",
      }}
    >
      {children}
    </div>
  );
}
