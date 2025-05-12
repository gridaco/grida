/**
 * @deprecated
 */
const zinc = {
  light: {
    "--background": { h: 0, s: 0, l: 100 },
    "--foreground": { h: 240, s: 10, l: 3.9 },
    "--card": { h: 0, s: 0, l: 100 },
    "--card-foreground": { h: 240, s: 10, l: 3.9 },
    "--popover": { h: 0, s: 0, l: 100 },
    "--popover-foreground": { h: 240, s: 10, l: 3.9 },
    "--primary": { h: 240, s: 5.9, l: 10 },
    "--primary-foreground": { h: 0, s: 0, l: 98 },
    "--secondary": { h: 240, s: 4.8, l: 95.9 },
    "--secondary-foreground": { h: 240, s: 5.9, l: 10 },
    "--muted": { h: 240, s: 4.8, l: 95.9 },
    "--muted-foreground": { h: 240, s: 3.8, l: 46.1 },
    "--accent": { h: 240, s: 4.8, l: 95.9 },
    "--accent-foreground": { h: 240, s: 5.9, l: 10 },
    "--destructive": { h: 0, s: 84.2, l: 60.2 },
    "--border": { h: 240, s: 5.9, l: 90 },
    "--input": { h: 240, s: 5.9, l: 90 },
    "--ring": { h: 240, s: 5.9, l: 10 },
    "--radius": "0.5rem",
  },
  dark: {
    "--background": { h: 240, s: 10, l: 3.9 },
    "--foreground": { h: 0, s: 0, l: 98 },
    "--card": { h: 240, s: 10, l: 3.9 },
    "--card-foreground": { h: 0, s: 0, l: 98 },
    "--popover": { h: 240, s: 10, l: 3.9 },
    "--popover-foreground": { h: 0, s: 0, l: 98 },
    "--primary": { h: 0, s: 0, l: 98 },
    "--primary-foreground": { h: 240, s: 5.9, l: 10 },
    "--secondary": { h: 240, s: 3.7, l: 15.9 },
    "--secondary-foreground": { h: 0, s: 0, l: 98 },
    "--muted": { h: 240, s: 3.7, l: 15.9 },
    "--muted-foreground": { h: 240, s: 5, l: 64.9 },
    "--accent": { h: 240, s: 3.7, l: 15.9 },
    "--accent-foreground": { h: 0, s: 0, l: 98 },
    "--destructive": { h: 0, s: 62.8, l: 30.6 },
    "--border": { h: 240, s: 3.7, l: 15.9 },
    "--input": { h: 240, s: 3.7, l: 15.9 },
    "--ring": { h: 240, s: 4.9, l: 83.9 },
    "--radius": "0.5rem",
  },
} as const;

export default zinc;
