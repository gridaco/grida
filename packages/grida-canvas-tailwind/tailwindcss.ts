const __64 = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64];
const __100 = [0, 25, 50, 75, 100];

// prettier-ignore
const __2345612 = ['1/2', '1/3', '2/3', '1/4', '2/4', '3/4', '1/5', '2/5', '3/5', '4/5', '1/6', '2/6', '3/6', '4/6', '5/6', '1/12', '2/12', '3/12', '4/12', '5/12', '6/12', '7/12', '8/12', '9/12', '10/12', '11/12'];

// prettier-ignore
const margin = {
  prefix: [
    "m", "mt", "mr", "mb", "ml", "mx", "my",
    "-m", "-mt", "-mr", "-mb", "-ml", "-mx", "-my",
  ],
  units: [...__64, "px", "auto" ],
};

const width = {
  prefix: ["w"],
  units: [...__64, "px", "auto", "full", "screen", ...__2345612],
  //
};

const __w_min_max = [
  "3xs",
  "2xs",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "auto",
  "px",
  "full",
  "screen",
  "dvw",
  "dvh",
  "lvw",
  "lvh",
  "svw",
  "svh",
  "min",
  "max",
  "fit",
];

const minwidth = {
  prefix: ["min-w"],
  units: [...__w_min_max],
};

const maxwidth = {
  prefix: ["max-w"],
  units: [...__w_min_max],
};

/**
 * @see https://tailwindcss.com/docs/cursor
 */
const cursor = {
  prefix: ["cursor"],
  classes: [
    "cursor-auto",
    "cursor-default",
    "cursor-pointer",
    "cursor-wait",
    "cursor-text",
    "cursor-move",
    "cursor-help",
    "cursor-not-allowed",
    "cursor-none",
    "cursor-context-menu",
    "cursor-progress",
    "cursor-cell",
    "cursor-crosshair",
    "cursor-vertical-text",
    "cursor-alias",
    "cursor-copy",
    "cursor-no-drop",
    "cursor-grab",
    "cursor-grabbing",
    "cursor-all-scroll",
    "cursor-col-resize",
    "cursor-row-resize",
    "cursor-n-resize",
    "cursor-e-resize",
    "cursor-s-resize",
    "cursor-w-resize",
    "cursor-ne-resize",
    "cursor-nw-resize",
    "cursor-se-resize",
    "cursor-sw-resize",
    "cursor-ew-resize",
    "cursor-ns-resize",
    "cursor-nesw-resize",
    "cursor-nwse-resize",
    "cursor-zoom-in",
    "cursor-zoom-out",
  ],
};

/**
 * @see https://tailwindcss.com/docs/opacity
 */
const opacity = {
  prefix: ["opacity"],
  units: [...__100],
};
