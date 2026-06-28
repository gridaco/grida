import { ImageResponse } from "next/og";

// Generated social card for /dotcanvas — asset-free (default font), so it
// always returns 200 with the correct content-type. Next resolves the absolute
// URL via the page's `metadataBase`.

export const alt =
  "The .canvas format — a portable directory of SVG documents plus a .canvas.json manifest";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0a0a0b",
        color: "#fafafa",
        padding: "72px 88px",
      }}
    >
      <div style={{ display: "flex" }}>
        <div
          style={{
            display: "flex",
            border: "2px dashed rgba(250,250,250,0.22)",
            borderRadius: 14,
            padding: "8px 20px",
            fontSize: 26,
            color: "rgba(250,250,250,0.6)",
            letterSpacing: "0.04em",
          }}
        >
          deck.canvas
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: 150,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          .canvas
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 42,
            color: "#a1a1aa",
          }}
        >
          Portable directory format
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontSize: 30,
            color: "#71717a",
          }}
        >
          SVG documents + a .canvas.json manifest
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 26,
          color: "#71717a",
        }}
      >
        <div style={{ display: "flex" }}>dotcanvas</div>
        <div style={{ display: "flex" }}>grida.co/dotcanvas</div>
      </div>
    </div>,
    { ...size }
  );
}
