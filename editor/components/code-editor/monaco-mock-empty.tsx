import React from "react";
export function MonacoEmptyMock() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        textAlign: "right",
        color: "#858585",
        background: "#1e1e1e",
      }}
    >
      {Array.from(Array(100).keys()).map((i) => (
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
