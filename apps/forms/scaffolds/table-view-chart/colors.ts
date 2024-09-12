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
      "1": colors.slate[900],
      "2": colors.slate[700],
      "3": colors.slate[500],
      "4": colors.slate[300],
      "5": colors.slate[100],
    },
  },
  gray: {
    label: "Gray",
    colors: {
      "1": colors.gray[900],
      "2": colors.gray[700],
      "3": colors.gray[500],
      "4": colors.gray[300],
      "5": colors.gray[100],
    },
  },
  zinc: {
    label: "Zinc",
    colors: {
      "1": colors.zinc[900],
      "2": colors.zinc[700],
      "3": colors.zinc[500],
      "4": colors.zinc[300],
      "5": colors.zinc[100],
    },
  },
  neutral: {
    label: "Neutral",
    colors: {
      "1": colors.neutral[900],
      "2": colors.neutral[700],
      "3": colors.neutral[500],
      "4": colors.neutral[300],
      "5": colors.neutral[100],
    },
  },
  stone: {
    label: "Stone",
    colors: {
      "1": colors.stone[900],
      "2": colors.stone[700],
      "3": colors.stone[500],
      "4": colors.stone[300],
      "5": colors.stone[100],
    },
  },
  red: {
    label: "Red",
    colors: {
      "1": colors.red[900],
      "2": colors.red[700],
      "3": colors.red[500],
      "4": colors.red[300],
      "5": colors.red[100],
    },
  },
  orange: {
    label: "Orange",
    colors: {
      "1": colors.orange[900],
      "2": colors.orange[700],
      "3": colors.orange[500],
      "4": colors.orange[300],
      "5": colors.orange[100],
    },
  },
  amber: {
    label: "Amber",
    colors: {
      "1": colors.amber[900],
      "2": colors.amber[700],
      "3": colors.amber[500],
      "4": colors.amber[300],
      "5": colors.amber[100],
    },
  },
  yellow: {
    label: "Yellow",
    colors: {
      "1": colors.yellow[900],
      "2": colors.yellow[700],
      "3": colors.yellow[500],
      "4": colors.yellow[300],
      "5": colors.yellow[100],
    },
  },
  lime: {
    label: "Lime",
    colors: {
      "1": colors.lime[900],
      "2": colors.lime[700],
      "3": colors.lime[500],
      "4": colors.lime[300],
      "5": colors.lime[100],
    },
  },
  green: {
    label: "Green",
    colors: {
      "1": colors.green[900],
      "2": colors.green[700],
      "3": colors.green[500],
      "4": colors.green[300],
      "5": colors.green[100],
    },
  },
  emerald: {
    label: "Emerald",
    colors: {
      "1": colors.emerald[900],
      "2": colors.emerald[700],
      "3": colors.emerald[500],
      "4": colors.emerald[300],
      "5": colors.emerald[100],
    },
  },
  teal: {
    label: "Teal",
    colors: {
      "1": colors.teal[900],
      "2": colors.teal[700],
      "3": colors.teal[500],
      "4": colors.teal[300],
      "5": colors.teal[100],
    },
  },
  cyan: {
    label: "Cyan",
    colors: {
      "1": colors.cyan[900],
      "2": colors.cyan[700],
      "3": colors.cyan[500],
      "4": colors.cyan[300],
      "5": colors.cyan[100],
    },
  },
  sky: {
    label: "Sky",
    colors: {
      "1": colors.sky[900],
      "2": colors.sky[700],
      "3": colors.sky[500],
      "4": colors.sky[300],
      "5": colors.sky[100],
    },
  },
  blue: {
    label: "Blue",
    colors: {
      "1": colors.blue[900],
      "2": colors.blue[700],
      "3": colors.blue[500],
      "4": colors.blue[300],
      "5": colors.blue[100],
    },
  },
  indigo: {
    label: "Indigo",
    colors: {
      "1": colors.indigo[900],
      "2": colors.indigo[700],
      "3": colors.indigo[500],
      "4": colors.indigo[300],
      "5": colors.indigo[100],
    },
  },
  violet: {
    label: "Violet",
    colors: {
      "1": colors.violet[900],
      "2": colors.violet[700],
      "3": colors.violet[500],
      "4": colors.violet[300],
      "5": colors.violet[100],
    },
  },
  purple: {
    label: "Purple",
    colors: {
      "1": colors.purple[900],
      "2": colors.purple[700],
      "3": colors.purple[500],
      "4": colors.purple[300],
      "5": colors.purple[100],
    },
  },
  fuchsia: {
    label: "Fuchsia",
    colors: {
      "1": colors.fuchsia[900],
      "2": colors.fuchsia[700],
      "3": colors.fuchsia[500],
      "4": colors.fuchsia[300],
      "5": colors.fuchsia[100],
    },
  },
  pink: {
    label: "Pink",
    colors: {
      "1": colors.pink[900],
      "2": colors.pink[700],
      "3": colors.pink[500],
      "4": colors.pink[300],
      "5": colors.pink[100],
    },
  },
  rose: {
    label: "Rose",
    colors: {
      "1": colors.rose[900],
      "2": colors.rose[700],
      "3": colors.rose[500],
      "4": colors.rose[300],
      "5": colors.rose[100],
    },
  },
};
