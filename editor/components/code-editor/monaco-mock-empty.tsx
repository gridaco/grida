import React from "react";
export function MonacoEmptyMock({ l = 100 }: { l?: number }) {
  return (
    <div
      style={{
        position: "relative",
        top: 0,
        height: 0,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        textAlign: "right",
        color: "#858585",
        background: "#1e1e1e",
      }}
    >
      {Array.from(Array(l).keys()).map((i) => (
        <span
          style={{
            left: 0,
            width: 36,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontWeight: "normal",
            fontSize: 12,
            lineHeight: "18px",
          }}
          key={i.toString()}
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}
