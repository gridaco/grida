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
    "1": HexStr;
    "2": HexStr;
    "3": HexStr;
    "4": HexStr;
    "5": HexStr;
  };
}

export const STANDARD_PALETTES: DataChartPalette[] = [
  "theme-charts-1",
  "neutral",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
];

export const CHART_PALETTES: Record<DataChartPalette, ChartPaletteConfig> = {
  "theme-charts-1": {
    label: "Colorful",
    colors: {
      "1": "#e76e50",
      "2": "#2a9d90",
      "3": "#274754",
      "4": "#e8c468",
      "5": "#f4a462",
    },
  },
  slate: {
    label: "Slate",
    colors: {
      "1": colors.slate[500],
      "2": colors.slate[400],
      "3": colors.slate[300],
      "4": colors.slate[200],
      "5": colors.slate[100],
    },
  },
  gray: {
    label: "Gray",
    colors: {
      "1": colors.gray[500],
      "2": colors.gray[400],
      "3": colors.gray[300],
      "4": colors.gray[200],
      "5": colors.gray[100],
    },
  },
  zinc: {
    label: "Zinc",
    colors: {
      "1": colors.zinc[500],
      "2": colors.zinc[400],
      "3": colors.zinc[300],
      "4": colors.zinc[200],
      "5": colors.zinc[100],
    },
  },
  neutral: {
    label: "Neutral",
    colors: {
      "1": colors.neutral[500],
      "2": colors.neutral[400],
      "3": colors.neutral[300],
      "4": colors.neutral[200],
      "5": colors.neutral[100],
    },
  },
  stone: {
    label: "Stone",
    colors: {
      "1": colors.stone[500],
      "2": colors.stone[400],
      "3": colors.stone[300],
      "4": colors.stone[200],
      "5": colors.stone[100],
    },
  },
  red: {
    label: "Red",
    colors: {
      "1": colors.red[500],
      "2": colors.red[400],
      "3": colors.red[300],
      "4": colors.red[200],
      "5": colors.red[100],
    },
  },
  orange: {
    label: "Orange",
    colors: {
      "1": colors.orange[500],
      "2": colors.orange[400],
      "3": colors.orange[300],
      "4": colors.orange[200],
      "5": colors.orange[100],
    },
  },
  amber: {
    label: "Amber",
    colors: {
      "1": colors.amber[500],
      "2": colors.amber[400],
      "3": colors.amber[300],
      "4": colors.amber[200],
      "5": colors.amber[100],
    },
  },
  yellow: {
    label: "Yellow",
    colors: {
      "1": colors.yellow[500],
      "2": colors.yellow[400],
      "3": colors.yellow[300],
      "4": colors.yellow[200],
      "5": colors.yellow[100],
    },
  },
  lime: {
    label: "Lime",
    colors: {
      "1": colors.lime[500],
      "2": colors.lime[400],
      "3": colors.lime[300],
      "4": colors.lime[200],
      "5": colors.lime[100],
    },
  },
  green: {
    label: "Green",
    colors: {
      "1": colors.green[500],
      "2": colors.green[400],
      "3": colors.green[300],
      "4": colors.green[200],
      "5": colors.green[100],
    },
  },
  emerald: {
    label: "Emerald",
    colors: {
      "1": colors.emerald[500],
      "2": colors.emerald[400],
      "3": colors.emerald[300],
      "4": colors.emerald[200],
      "5": colors.emerald[100],
    },
  },
  teal: {
    label: "Teal",
    colors: {
      "1": colors.teal[500],
      "2": colors.teal[400],
      "3": colors.teal[300],
      "4": colors.teal[200],
      "5": colors.teal[100],
    },
  },
  cyan: {
    label: "Cyan",
    colors: {
      "1": colors.cyan[500],
      "2": colors.cyan[400],
      "3": colors.cyan[300],
      "4": colors.cyan[200],
      "5": colors.cyan[100],
    },
  },
  sky: {
    label: "Sky",
    colors: {
      "1": colors.sky[500],
      "2": colors.sky[400],
      "3": colors.sky[300],
      "4": colors.sky[200],
      "5": colors.sky[100],
    },
  },
  blue: {
    label: "Blue",
    colors: {
      "1": colors.blue[500],
      "2": colors.blue[400],
      "3": colors.blue[300],
      "4": colors.blue[200],
      "5": colors.blue[100],
    },
  },
  indigo: {
    label: "Indigo",
    colors: {
      "1": colors.indigo[500],
      "2": colors.indigo[400],
      "3": colors.indigo[300],
      "4": colors.indigo[200],
      "5": colors.indigo[100],
    },
  },
  violet: {
    label: "Violet",
    colors: {
      "1": colors.violet[500],
      "2": colors.violet[400],
      "3": colors.violet[300],
      "4": colors.violet[200],
      "5": colors.violet[100],
    },
  },
  purple: {
    label: "Purple",
    colors: {
      "1": colors.purple[500],
      "2": colors.purple[400],
      "3": colors.purple[300],
      "4": colors.purple[200],
      "5": colors.purple[100],
    },
  },
  fuchsia: {
    label: "Fuchsia",
    colors: {
      "1": colors.fuchsia[500],
      "2": colors.fuchsia[400],
      "3": colors.fuchsia[300],
      "4": colors.fuchsia[200],
      "5": colors.fuchsia[100],
    },
  },
  pink: {
    label: "Pink",
    colors: {
      "1": colors.pink[500],
      "2": colors.pink[400],
      "3": colors.pink[300],
      "4": colors.pink[200],
      "5": colors.pink[100],
    },
  },
  rose: {
    label: "Rose",
    colors: {
      "1": colors.rose[500],
      "2": colors.rose[400],
      "3": colors.rose[300],
      "4": colors.rose[200],
      "5": colors.rose[100],
    },
  },
};
