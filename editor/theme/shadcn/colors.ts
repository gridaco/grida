export interface SchemedColorToken {
  /**
   * css variable name (including `--`)
   */
  name: string;
  description: string;

  /**
   * value for light (default) theme
   */
  light: string;

  /**
   * value for dark theme
   */
  dark: string;
}

/**
 * @see https://ui.shadcn.com/docs/theming#list-of-variables
 */
export interface ThemeColors {
  background: SchemedColorToken;
  foreground: SchemedColorToken;
  card: SchemedColorToken;
  "card-foreground": SchemedColorToken;
  popover: SchemedColorToken;
  "popover-foreground": SchemedColorToken;
  primary: SchemedColorToken;
  "primary-foreground": SchemedColorToken;
  secondary: SchemedColorToken;
  "secondary-foreground": SchemedColorToken;
  muted: SchemedColorToken;
  "muted-foreground": SchemedColorToken;
  accent: SchemedColorToken;
  "accent-foreground": SchemedColorToken;
  destructive: SchemedColorToken;
  border: SchemedColorToken;
  input: SchemedColorToken;
  ring: SchemedColorToken;
  "chart-1": SchemedColorToken;
  "chart-2": SchemedColorToken;
  "chart-3": SchemedColorToken;
  "chart-4": SchemedColorToken;
  "chart-5": SchemedColorToken;
  // sidebar: SchemedColorToken;
  // "sidebar-foreground": SchemedColorToken;
  // "sidebar-primary": SchemedColorToken;
  // "sidebar-primary-foreground": SchemedColorToken;
  // "sidebar-accent": SchemedColorToken;
  // "sidebar-accent-foreground": SchemedColorToken;
  // "sidebar-border": SchemedColorToken;
  // "sidebar-ring": SchemedColorToken;
}

export const defaultThemeColors: ThemeColors = {
  background: {
    name: "--background",
    description: "Background color",
    light: "oklch(1 0 0)",
    dark: "oklch(0.145 0 0)",
  },
  foreground: {
    name: "--foreground",
    description: "Foreground (Text) color",
    light: "oklch(0.145 0 0)",
    dark: "oklch(0.985 0 0)",
  },
  card: {
    name: "--card",
    description: "Card background color",
    light: "oklch(1 0 0)",
    dark: "oklch(0.145 0 0)",
  },
  "card-foreground": {
    name: "--card-foreground",
    description: "Card text color",
    light: "oklch(0.145 0 0)",
    dark: "oklch(0.985 0 0)",
  },
  popover: {
    name: "--popover",
    description: "Popover background color",
    light: "oklch(1 0 0)",
    dark: "oklch(0.145 0 0)",
  },
  "popover-foreground": {
    name: "--popover-foreground",
    description: "Popover text color",
    light: "oklch(0.145 0 0)",
    dark: "oklch(0.985 0 0)",
  },
  primary: {
    name: "--primary",
    description: "Primary color",
    light: "oklch(0.205 0 0)",
    dark: "oklch(0.985 0 0)",
  },
  "primary-foreground": {
    name: "--primary-foreground",
    description: "Primary text color",
    light: "oklch(0.985 0 0)",
    dark: "oklch(0.205 0 0)",
  },
  secondary: {
    name: "--secondary",
    description: "Secondary color",
    light: "oklch(0.97 0 0)",
    dark: "oklch(0.269 0 0)",
  },
  "secondary-foreground": {
    name: "--secondary-foreground",
    description: "Secondary text color",
    light: "oklch(0.205 0 0)",
    dark: "oklch(0.985 0 0)",
  },
  muted: {
    name: "--muted",
    description: "Muted background color",
    light: "oklch(0.97 0 0)",
    dark: "oklch(0.269 0 0)",
  },
  "muted-foreground": {
    name: "--muted-foreground",
    description: "Muted text color",
    light: "oklch(0.556 0 0)",
    dark: "oklch(0.708 0 0)",
  },
  accent: {
    name: "--accent",
    description: "Accent color",
    light: "oklch(0.97 0 0)",
    dark: "oklch(0.269 0 0)",
  },
  "accent-foreground": {
    name: "--accent-foreground",
    description: "Accent text color",
    light: "oklch(0.205 0 0)",
    dark: "oklch(0.985 0 0)",
  },
  destructive: {
    name: "--destructive",
    description: "Destructive color",
    light: "oklch(0.577 0.245 27.325)",
    dark: "oklch(0.396 0.141 25.723)",
  },
  border: {
    name: "--border",
    description: "Border color",
    light: "oklch(0.922 0 0)",
    dark: "oklch(0.269 0 0)",
  },
  input: {
    name: "--input",
    description: "Input background color",
    light: "oklch(0.922 0 0)",
    dark: "oklch(0.269 0 0)",
  },
  ring: {
    name: "--ring",
    description: "Ring color for focus states",
    light: "oklch(0.708 0 0)",
    dark: "oklch(0.556 0 0)",
  },
  "chart-1": {
    name: "--chart-1",
    description: "Chart color 1",
    light: "oklch(0.646 0.222 41.116)",
    dark: "oklch(0.488 0.243 264.376)",
  },
  "chart-2": {
    name: "--chart-2",
    description: "Chart color 2",
    light: "oklch(0.6 0.118 184.704)",
    dark: "oklch(0.696 0.17 162.48)",
  },
  "chart-3": {
    name: "--chart-3",
    description: "Chart color 3",
    light: "oklch(0.398 0 227.392)",
    dark: "oklch(0.769 0.188 70.08)",
  },
  "chart-4": {
    name: "--chart-4",
    description: "Chart color 4",
    light: "oklch(0.828 0.189 84.429)",
    dark: "oklch(0.627 0.265 303.9)",
  },
  "chart-5": {
    name: "--chart-5",
    description: "Chart color 5",
    light: "oklch(0.769 0.188 70.08)",
    dark: "oklch(0.645 0.246 16.439)",
  },
};
