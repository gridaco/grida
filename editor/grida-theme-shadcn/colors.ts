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
  "destructive-foreground": SchemedColorToken;
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

const hsl = (value: string) => `hsl(${value})`;

export const defaultThemeColors: ThemeColors = {
  background: {
    name: "--background",
    description: "Background color",
    // light: "oklch(1 0 0)",
    // dark: "oklch(0.145 0 0)",
    light: hsl("0 0% 100%"),
    dark: hsl("240 10% 3.9%"),
  },
  foreground: {
    name: "--foreground",
    description: "Foreground (Text) color",
    // light: "oklch(0.145 0 0)",
    // dark: "oklch(0.985 0 0)",
    light: hsl("240 10% 3.9%"),
    dark: hsl("0 0% 98%"),
  },
  card: {
    name: "--card",
    description: "Card background color",
    // light: "oklch(1 0 0)",
    // dark: "oklch(0.145 0 0)",
    light: hsl("0 0% 100%"),
    dark: hsl("240 10% 3.9%"),
  },
  "card-foreground": {
    name: "--card-foreground",
    description: "Card text color",
    // light: "oklch(0.145 0 0)",
    // dark: "oklch(0.985 0 0)",
    light: hsl("240 10% 3.9%"),
    dark: hsl("0 0% 98%"),
  },
  popover: {
    name: "--popover",
    description: "Popover background color",
    // light: "oklch(1 0 0)",
    // dark: "oklch(0.145 0 0)",
    light: hsl("0 0% 100%"),
    dark: hsl("240 10% 3.9%"),
  },
  "popover-foreground": {
    name: "--popover-foreground",
    description: "Popover text color",
    // light: "oklch(0.145 0 0)",
    // dark: "oklch(0.985 0 0)",
    light: hsl("240 10% 3.9%"),
    dark: hsl("0 0% 98%"),
  },
  primary: {
    name: "--primary",
    description: "Primary color",
    // light: "oklch(0.205 0 0)",
    // dark: "oklch(0.985 0 0)",
    light: hsl("240 5.9% 10%"),
    dark: hsl("0 0% 98%"),
  },
  "primary-foreground": {
    name: "--primary-foreground",
    description: "Primary text color",
    // light: "oklch(0.985 0 0)",
    // dark: "oklch(0.205 0 0)",
    light: hsl("0 0% 98%"),
    dark: hsl("240 5.9% 10%"),
  },
  secondary: {
    name: "--secondary",
    description: "Secondary color",
    // light: "oklch(0.97 0 0)",
    // dark: "oklch(0.269 0 0)",
    light: hsl("240 4.8% 95.9%"),
    dark: hsl("240 3.7% 15.9%"),
  },
  "secondary-foreground": {
    name: "--secondary-foreground",
    description: "Secondary text color",
    // light: "oklch(0.205 0 0)",
    // dark: "oklch(0.985 0 0)",
    light: hsl("240 5.9% 10%"),
    dark: hsl("0 0% 98%"),
  },
  muted: {
    name: "--muted",
    description: "Muted background color",
    // light: "oklch(0.97 0 0)",
    // dark: "oklch(0.269 0 0)",
    light: hsl("240 4.8% 95.9%"),
    dark: hsl("240 3.7% 15.9%"),
  },
  "muted-foreground": {
    name: "--muted-foreground",
    description: "Muted text color",
    // light: "oklch(0.556 0 0)",
    // dark: "oklch(0.708 0 0)",
    light: hsl("240 3.8% 46.1%"),
    dark: hsl("240 5% 64.9%"),
  },
  accent: {
    name: "--accent",
    description: "Accent color",
    // light: "oklch(0.97 0 0)",
    // dark: "oklch(0.269 0 0)",
    light: hsl("240 4.8% 95.9%"),
    dark: hsl("240 3.7% 15.9%"),
  },
  "accent-foreground": {
    name: "--accent-foreground",
    description: "Accent text color",
    // light: "oklch(0.205 0 0)",
    // dark: "oklch(0.985 0 0)",
    light: hsl("240 5.9% 10%"),
    dark: hsl("0 0% 98%"),
  },
  destructive: {
    name: "--destructive",
    description: "Destructive color",
    // light: "oklch(0.577 0.245 27.325)",
    // dark: "oklch(0.396 0.141 25.723)",
    light: hsl("0 84.2% 60.2%"),
    dark: hsl("0 62.8% 30.6%"),
  },
  "destructive-foreground": {
    name: "--destructive-foreground",
    description: "Destructive text color",
    // light: "oklch(0.577 0.245 27.325)",
    // dark: "oklch(0.637 0.237 25.331)",
    light: hsl("0 0% 98%"),
    dark: hsl("0 0% 98%"),
  },
  border: {
    name: "--border",
    description: "Border color",
    // light: "oklch(0.922 0 0)",
    // dark: "oklch(0.269 0 0)",
    light: hsl("240 5.9% 90%"),
    dark: hsl("240 3.7% 15.9%"),
  },
  input: {
    name: "--input",
    description: "Input background color",
    // light: "oklch(0.922 0 0)",
    // dark: "oklch(0.269 0 0)",
    light: hsl("240 5.9% 90%"),
    dark: hsl("240 3.7% 15.9%"),
  },
  ring: {
    name: "--ring",
    description: "Ring color for focus states",
    // light: "oklch(0.708 0 0)",
    // dark: "oklch(0.556 0 0)",
    light: hsl("240 5.9% 10%"),
    dark: hsl("240 4.9% 83.9%"),
  },
  "chart-1": {
    name: "--chart-1",
    description: "Chart color 1",
    // light: "oklch(0.646 0.222 41.116)",
    // dark: "oklch(0.488 0.243 264.376)",
    light: hsl("12 76% 61%"),
    dark: hsl("220 70% 50%"),
  },
  "chart-2": {
    name: "--chart-2",
    description: "Chart color 2",
    // light: "oklch(0.6 0.118 184.704)",
    // dark: "oklch(0.696 0.17 162.48)",
    light: hsl("173 58% 39%"),
    dark: hsl("160 60% 45%"),
  },
  "chart-3": {
    name: "--chart-3",
    description: "Chart color 3",
    // light: "oklch(0.398 0 227.392)",
    // dark: "oklch(0.769 0.188 70.08)",
    light: hsl("197 37% 24%"),
    dark: hsl("30 80% 55%"),
  },
  "chart-4": {
    name: "--chart-4",
    description: "Chart color 4",
    // light: "oklch(0.828 0.189 84.429)",
    // dark: "oklch(0.627 0.265 303.9)",
    light: hsl("43 74% 66%"),
    dark: hsl("280 65% 60%"),
  },
  "chart-5": {
    name: "--chart-5",
    description: "Chart color 5",
    // light: "oklch(0.769 0.188 70.08)",
    // dark: "oklch(0.645 0.246 16.439)",
    light: hsl("27 87% 67%"),
    dark: hsl("340 75% 55%"),
  },
};
