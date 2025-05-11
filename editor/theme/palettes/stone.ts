/**
 * @deprecated
 */
const stone = {
  light: {
    "--background": { h: 0, s: 0, l: 100 },
    "--foreground": { h: 20, s: 14.3, l: 4.1 },
    "--card": { h: 0, s: 0, l: 100 },
    "--card-foreground": { h: 20, s: 14.3, l: 4.1 },
    "--popover": { h: 0, s: 0, l: 100 },
    "--popover-foreground": { h: 20, s: 14.3, l: 4.1 },
    "--primary": { h: 24, s: 9.8, l: 10 },
    "--primary-foreground": { h: 60, s: 9.1, l: 97.8 },
    "--secondary": { h: 60, s: 4.8, l: 95.9 },
    "--secondary-foreground": { h: 24, s: 9.8, l: 10 },
    "--muted": { h: 60, s: 4.8, l: 95.9 },
    "--muted-foreground": { h: 25, s: 5.3, l: 44.7 },
    "--accent": { h: 60, s: 4.8, l: 95.9 },
    "--accent-foreground": { h: 24, s: 9.8, l: 10 },
    "--destructive": { h: 0, s: 84.2, l: 60.2 },
    "--border": { h: 20, s: 5.9, l: 90 },
    "--input": { h: 20, s: 5.9, l: 90 },
    "--ring": { h: 20, s: 14.3, l: 4.1 },
    "--radius": "0.5rem",
  },
  dark: {
    "--background": { h: 20, s: 14.3, l: 4.1 },
    "--foreground": { h: 60, s: 9.1, l: 97.8 },
    "--card": { h: 20, s: 14.3, l: 4.1 },
    "--card-foreground": { h: 60, s: 9.1, l: 97.8 },
    "--popover": { h: 20, s: 14.3, l: 4.1 },
    "--popover-foreground": { h: 60, s: 9.1, l: 97.8 },
    "--primary": { h: 60, s: 9.1, l: 97.8 },
    "--primary-foreground": { h: 24, s: 9.8, l: 10 },
    "--secondary": { h: 12, s: 6.5, l: 15.1 },
    "--secondary-foreground": { h: 60, s: 9.1, l: 97.8 },
    "--muted": { h: 12, s: 6.5, l: 15.1 },
    "--muted-foreground": { h: 24, s: 5.4, l: 63.9 },
    "--accent": { h: 12, s: 6.5, l: 15.1 },
    "--accent-foreground": { h: 60, s: 9.1, l: 97.8 },
    "--destructive": { h: 0, s: 62.8, l: 30.6 },
    "--border": { h: 12, s: 6.5, l: 15.1 },
    "--input": { h: 12, s: 6.5, l: 15.1 },
    "--ring": { h: 24, s: 5.7, l: 82.9 },
    "--radius": "0.5rem",
  },
} as const;

export default stone;
