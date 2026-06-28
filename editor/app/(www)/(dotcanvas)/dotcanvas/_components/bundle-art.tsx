import React from "react";

const MONO = "var(--font-geist-mono, ui-monospace, SFMono-Regular, monospace)";

/**
 * Minimal line-art of a `.canvas` bundle: a directory (dashed boundary)
 * holding a `.canvas.json` manifest that references standalone SVG documents.
 * Monochrome — everything is `currentColor` at varying opacity, so it adapts
 * to light/dark from the inherited text color alone.
 */
export function BundleArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 440 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="A .canvas bundle: a .canvas.json manifest referencing standalone SVG documents"
      className={className}
    >
      {/* bundle boundary — the directory */}
      <rect
        x="16"
        y="40"
        width="408"
        height="244"
        rx="16"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="1.5"
        strokeDasharray="5 6"
      />

      {/* header: directory name */}
      <rect
        x="34"
        y="62"
        width="9"
        height="9"
        rx="1.5"
        transform="rotate(45 38.5 66.5)"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
      <text
        x="54"
        y="71"
        fontFamily={MONO}
        fontSize="13"
        fill="currentColor"
        fillOpacity="0.62"
      >
        deck.canvas
      </text>
      <line
        x1="32"
        y1="88"
        x2="408"
        y2="88"
        stroke="currentColor"
        strokeOpacity="0.12"
      />

      {/* connectors: manifest -> each document (drawn under the tiles) */}
      <g stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.25">
        <path d="M150 158 C 188 158 196 134 224 134" />
        <path d="M150 158 C 232 158 256 168 326 168" />
        <path d="M150 158 C 188 158 198 216 228 216" />
      </g>
      <circle cx="150" cy="158" r="2.5" fill="currentColor" fillOpacity="0.5" />

      {/* the manifest — the only authoritative file */}
      <rect
        x="40"
        y="112"
        width="110"
        height="92"
        rx="10"
        fill="currentColor"
        fillOpacity="0.04"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />
      <text
        x="54"
        y="136"
        fontFamily={MONO}
        fontSize="11"
        fill="currentColor"
        fillOpacity="0.7"
      >
        .canvas.json
      </text>
      <g fill="currentColor" fillOpacity="0.14">
        <rect x="54" y="150" width="64" height="5" rx="2.5" />
        <rect x="54" y="164" width="82" height="5" rx="2.5" />
        <rect x="54" y="178" width="50" height="5" rx="2.5" />
      </g>

      {/* documents — standalone SVG tiles, placed like a board */}
      {/* 001 */}
      <rect
        x="224"
        y="104"
        width="96"
        height="62"
        rx="8"
        fill="currentColor"
        fillOpacity="0.02"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.25"
      />
      <text
        x="232"
        y="121"
        fontFamily={MONO}
        fontSize="9"
        fill="currentColor"
        fillOpacity="0.5"
      >
        001.svg
      </text>
      <g fill="currentColor" fillOpacity="0.18">
        <rect x="244" y="143" width="8" height="14" rx="1.5" />
        <rect x="258" y="135" width="8" height="22" rx="1.5" />
        <rect x="272" y="148" width="8" height="9" rx="1.5" />
      </g>

      {/* 002 */}
      <rect
        x="326"
        y="140"
        width="86"
        height="58"
        rx="8"
        fill="currentColor"
        fillOpacity="0.02"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.25"
      />
      <text
        x="334"
        y="159"
        fontFamily={MONO}
        fontSize="9"
        fill="currentColor"
        fillOpacity="0.5"
      >
        002.svg
      </text>
      <circle
        cx="356"
        cy="180"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="1.25"
      />
      <rect
        x="372"
        y="178"
        width="28"
        height="4"
        rx="2"
        fill="currentColor"
        fillOpacity="0.16"
      />

      {/* 003 */}
      <rect
        x="228"
        y="188"
        width="92"
        height="56"
        rx="8"
        fill="currentColor"
        fillOpacity="0.02"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.25"
      />
      <text
        x="236"
        y="206"
        fontFamily={MONO}
        fontSize="9"
        fill="currentColor"
        fillOpacity="0.5"
      >
        003.svg
      </text>
      <g fill="currentColor" fillOpacity="0.14">
        <rect x="240" y="216" width="64" height="4" rx="2" />
        <rect x="240" y="226" width="44" height="4" rx="2" />
      </g>
    </svg>
  );
}
