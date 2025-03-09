export interface ColorToken {
  css: string;
  description: string;
  default: {
    light: string;
    dark: string;
  };
}

/**
 * @see https://ui.shadcn.com/docs/theming#list-of-variables
 */
export interface ThemeColors {
  background: ColorToken;
  foreground: ColorToken;
  card: ColorToken;
  "card-foreground": ColorToken;
  popover: ColorToken;
  "popover-foreground": ColorToken;
  primary: ColorToken;
  "primary-foreground": ColorToken;
  secondary: ColorToken;
  "secondary-foreground": ColorToken;
  muted: ColorToken;
  "muted-foreground": ColorToken;
  accent: ColorToken;
  "accent-foreground": ColorToken;
  destructive: ColorToken;
  "destructive-foreground": ColorToken;
  border: ColorToken;
  input: ColorToken;
  ring: ColorToken;
  "chart-1": ColorToken;
  "chart-2": ColorToken;
  "chart-3": ColorToken;
  "chart-4": ColorToken;
  "chart-5": ColorToken;
  sidebar: ColorToken;
  "sidebar-foreground": ColorToken;
  "sidebar-primary": ColorToken;
  "sidebar-primary-foreground": ColorToken;
  "sidebar-accent": ColorToken;
  "sidebar-accent-foreground": ColorToken;
  "sidebar-border": ColorToken;
  "sidebar-ring": ColorToken;
}

export const defaultThemeColors: ThemeColors = {
  background: {
    css: "--background",
    description: "Background color",
    default: {
      light: "oklch(1 0 0)",
      dark: "oklch(0.145 0 0)",
    },
  },
  foreground: {
    css: "--foreground",
    description: "Foreground (Text) color",
    default: {
      light: "oklch(0.145 0 0)",
      dark: "oklch(0.985 0 0)",
    },
  },
  card: {
    css: "--card",
    description: "Card background color",
    default: {
      light: "oklch(1 0 0)",
      dark: "oklch(0.145 0 0)",
    },
  },
  "card-foreground": {
    css: "--card-foreground",
    description: "Card text color",
    default: {
      light: "oklch(0.145 0 0)",
      dark: "oklch(0.985 0 0)",
    },
  },
  popover: {
    css: "--popover",
    description: "Popover background color",
    default: {
      light: "oklch(1 0 0)",
      dark: "oklch(0.145 0 0)",
    },
  },
  "popover-foreground": {
    css: "--popover-foreground",
    description: "Popover text color",
    default: {
      light: "oklch(0.145 0 0)",
      dark: "oklch(0.985 0 0)",
    },
  },
  primary: {
    css: "--primary",
    description: "Primary color",
    default: {
      light: "oklch(0.205 0 0)",
      dark: "oklch(0.985 0 0)",
    },
  },
  "primary-foreground": {
    css: "--primary-foreground",
    description: "Primary text color",
    default: {
      light: "oklch(0.985 0 0)",
      dark: "oklch(0.205 0 0)",
    },
  },
  secondary: {
    css: "--secondary",
    description: "Secondary color",
    default: {
      light: "oklch(0.97 0 0)",
      dark: "oklch(0.269 0 0)",
    },
  },
  "secondary-foreground": {
    css: "--secondary-foreground",
    description: "Secondary text color",
    default: {
      light: "oklch(0.205 0 0)",
      dark: "oklch(0.985 0 0)",
    },
  },
  muted: {
    css: "--muted",
    description: "Muted background color",
    default: {
      light: "oklch(0.97 0 0)",
      dark: "oklch(0.269 0 0)",
    },
  },
  "muted-foreground": {
    css: "--muted-foreground",
    description: "Muted text color",
    default: {
      light: "oklch(0.556 0 0)",
      dark: "oklch(0.708 0 0)",
    },
  },
  accent: {
    css: "--accent",
    description: "Accent color",
    default: {
      light: "oklch(0.97 0 0)",
      dark: "oklch(0.269 0 0)",
    },
  },
  "accent-foreground": {
    css: "--accent-foreground",
    description: "Accent text color",
    default: {
      light: "oklch(0.205 0 0)",
      dark: "oklch(0.985 0 0)",
    },
  },
  destructive: {
    css: "--destructive",
    description: "Destructive color",
    default: {
      light: "oklch(0.577 0.245 27.325)",
      dark: "oklch(0.396 0.141 25.723)",
    },
  },
  "destructive-foreground": {
    css: "--destructive-foreground",
    description: "Destructive text color",
    default: {
      light: "oklch(0.577 0.245 27.325)",
      dark: "oklch(0.637 0.237 25.331)",
    },
  },
  border: {
    css: "--border",
    description: "Border color",
    default: {
      light: "oklch(0.922 0 0)",
      dark: "oklch(0.269 0 0)",
    },
  },
  input: {
    css: "--input",
    description: "Input background color",
    default: {
      light: "oklch(0.922 0 0)",
      dark: "oklch(0.269 0 0)",
    },
  },
  ring: {
    css: "--ring",
    description: "Ring color for focus states",
    default: {
      light: "oklch(0.708 0 0)",
      dark: "oklch(0.556 0 0)",
    },
  },
  "chart-1": {
    css: "--chart-1",
    description: "Chart color 1",
    default: {
      light: "oklch(0.646 0.222 41.116)",
      dark: "oklch(0.488 0.243 264.376)",
    },
  },
  "chart-2": {
    css: "--chart-2",
    description: "Chart color 2",
    default: {
      light: "oklch(0.6 0.118 184.704)",
      dark: "oklch(0.696 0.17 162.48)",
    },
  },
  "chart-3": {
    css: "--chart-3",
    description: "Chart color 3",
    default: {
      light: "oklch(0.398 0 227.392)",
      dark: "oklch(0.769 0.188 70.08)",
    },
  },
  "chart-4": {
    css: "--chart-4",
    description: "Chart color 4",
    default: {
      light: "oklch(0.828 0.189 84.429)",
      dark: "oklch(0.627 0.265 303.9)",
    },
  },
  "chart-5": {
    css: "--chart-5",
    description: "Chart color 5",
    default: {
      light: "oklch(0.769 0.188 70.08)",
      dark: "oklch(0.645 0.246 16.439)",
    },
  },
  sidebar: {
    css: "--sidebar",
    description: "Sidebar background",
    default: {
      light: "oklch(0.985 0 0)",
      dark: "oklch(0.205 0 0)",
    },
  },
  "sidebar-foreground": {
    css: "--sidebar-foreground",
    description: "Sidebar text color",
    default: {
      light: "oklch(0.145 0 0)",
      dark: "oklch(0.985 0 0)",
    },
  },
  "sidebar-primary": {
    css: "--sidebar-primary",
    description: "Sidebar primary color",
    default: {
      light: "oklch(0.205 0 0)",
      dark: "oklch(0.488 0.243 264.376)",
    },
  },
  "sidebar-primary-foreground": {
    css: "--sidebar-primary-foreground",
    description: "Sidebar primary text color",
    default: {
      light: "oklch(0.985 0 0)",
      dark: "oklch(0.985 0 0)",
    },
  },
  "sidebar-accent": {
    css: "--sidebar-accent",
    description: "Sidebar accent color",
    default: {
      light: "oklch(0.97 0 0)",
      dark: "oklch(0.269 0 0)",
    },
  },
  "sidebar-accent-foreground": {
    css: "--sidebar-accent-foreground",
    description: "Sidebar accent text color",
    default: {
      light: "oklch(0.205 0 0)",
      dark: "oklch(0.985 0 0)",
    },
  },
  "sidebar-border": {
    css: "--sidebar-border",
    description: "Sidebar border color",
    default: {
      light: "oklch(0.922 0 0)",
      dark: "oklch(0.269 0 0)",
    },
  },
  "sidebar-ring": {
    css: "--sidebar-ring",
    description: "Sidebar ring color",
    default: {
      light: "oklch(0.708 0 0)",
      dark: "oklch(0.439 0 0)",
    },
  },
};
