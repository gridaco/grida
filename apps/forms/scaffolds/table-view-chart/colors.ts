import colors from "@/k/tailwindcolors";

export type DataChartPalette =
  | "theme-charts-1" // also known as colorful
  // tailwindcss colors
  | "slate"
  | "gray"
  | "zinc"
  | "neutral"
  | "stone"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "fuchsia"
  | "pink"
  | "rose";

type HexStr = `#${string}`;

export interface ChartPaletteConfig {
  label: string;
  colors: {
    // designated for light theme
    "50": HexStr;
    "100": HexStr;
    "200": HexStr;
    "300": HexStr;
    "400": HexStr;
    // -
    "500": HexStr;
    // designated for dark theme
    "600": HexStr;
    "700": HexStr;
    "800": HexStr;
    "900": HexStr;
    "950": HexStr;
  };
}

export const CHART_PALETTES: Record<DataChartPalette, ChartPaletteConfig> = {
  "theme-charts-1": {
    label: "Colorful",
    colors: {
      "50": "#e76e50",
      "100": "#2a9d90",
      "200": "#274754",
      "300": "#e8c468",
      "400": "#f4a462",
      "500": "#d15f45",
      "600": "#1f776b",
      "700": "#1b3e44",
      "800": "#c6a041",
      "900": "#b65b2d",
      "950": "#16312d",
    },
  },
  slate: {
    label: "Slate",
    colors: colors.slate,
  },
  gray: {
    label: "Gray",
    colors: colors.gray,
  },
  zinc: {
    label: "Zinc",
    colors: colors.zinc,
  },
  neutral: {
    label: "Neutral",
    colors: colors.neutral,
  },
  stone: {
    label: "Stone",
    colors: colors.stone,
  },
  red: {
    label: "Red",
    colors: colors.red,
  },
  orange: {
    label: "Orange",
    colors: colors.orange,
  },
  amber: {
    label: "Amber",
    colors: colors.amber,
  },
  yellow: {
    label: "Yellow",
    colors: colors.yellow,
  },
  lime: {
    label: "Lime",
    colors: colors.lime,
  },
  green: {
    label: "Green",
    colors: colors.green,
  },
  emerald: {
    label: "Emerald",
    colors: colors.emerald,
  },
  teal: {
    label: "Teal",
    colors: colors.teal,
  },
  cyan: {
    label: "Cyan",
    colors: colors.cyan,
  },
  sky: {
    label: "Sky",
    colors: colors.sky,
  },
  blue: {
    label: "Blue",
    colors: colors.blue,
  },
  indigo: {
    label: "Indigo",
    colors: colors.indigo,
  },
  violet: {
    label: "Violet",
    colors: colors.violet,
  },
  purple: {
    label: "Purple",
    colors: colors.purple,
  },
  fuchsia: {
    label: "Fuchsia",
    colors: colors.fuchsia,
  },
  pink: {
    label: "Pink",
    colors: colors.pink,
  },
  rose: {
    label: "Rose",
    colors: colors.rose,
  },
};
