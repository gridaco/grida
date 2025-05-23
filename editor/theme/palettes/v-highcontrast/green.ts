const green = {
  light: {
    "--background": { h: 0, s: 0, l: 100 },
    "--foreground": { h: 129, s: 55, l: 47 },
    "--card": { h: 0, s: 0, l: 100 },
    "--card-foreground": { h: 240, s: 0, l: 100 },
    "--popover": { h: 0, s: 0, l: 100 },
    "--popover-foreground": { h: 122, s: 65, l: 44 },
    "--primary": { h: 142.1, s: 76.2, l: 36.3 },
    "--primary-foreground": { h: 356, s: 0, l: 100 },
    "--secondary": { h: 240, s: 0, l: 100 },
    "--secondary-foreground": { h: 240, s: 0, l: 100 },
    "--muted": { h: 123, s: 0, l: 100 },
    "--muted-foreground": { h: 240, s: 3.8, l: 46.1 },
    "--accent": { h: 141, s: 69, l: 40 },
    "--accent-foreground": { h: 118, s: 0, l: 100 },
    "--destructive": { h: 0, s: 84.2, l: 60.2 },
    "--border": { h: 134, s: 60, l: 44 },
    "--input": { h: 131, s: 62, l: 47 },
    "--ring": { h: 142, s: 74, l: 42 },
    "--radius": "0.5rem",
  },
  dark: {
    "--background": { h: 20, s: 14.3, l: 4.1 },
    "--foreground": { h: 131, s: 67, l: 48 },
    "--card": { h: 24, s: 0, l: 100 },
    "--card-foreground": { h: 0, s: 0, l: 0 },
    "--popover": { h: 0, s: 0, l: 0 },
    "--popover-foreground": { h: 134, s: 67, l: 46 },
    "--primary": { h: 142.1, s: 70.6, l: 45.3 },
    "--primary-foreground": { h: 145, s: 0, l: 0 },
    "--secondary": { h: 240, s: 0, l: 0 },
    "--secondary-foreground": { h: 0, s: 0, l: 0 },
    "--muted": { h: 0, s: 0, l: 0 },
    "--muted-foreground": { h: 136, s: 59, l: 52 },
    "--accent": { h: 141, s: 66, l: 45 },
    "--accent-foreground": { h: 0, s: 0, l: 0 },
    "--destructive": { h: 0, s: 62.8, l: 30.6 },
    "--border": { h: 140, s: 55, l: 49 },
    "--input": { h: 129, s: 70, l: 47 },
    "--ring": { h: 142, s: 67, l: 41 },
    "--radius": "0.5rem",
  },
} as const;

export default green;
