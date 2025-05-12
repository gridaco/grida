/**
 * @deprecated
 */
const gray = {
  light: {
    "--background": { h: 0, s: 0, l: 100 },
    "--foreground": { h: 224, s: 71.4, l: 4.1 },
    "--card": { h: 0, s: 0, l: 100 },
    "--card-foreground": { h: 224, s: 71.4, l: 4.1 },
    "--popover": { h: 0, s: 0, l: 100 },
    "--popover-foreground": { h: 224, s: 71.4, l: 4.1 },
    "--primary": { h: 220.9, s: 39.3, l: 11 },
    "--primary-foreground": { h: 210, s: 20, l: 98 },
    "--secondary": { h: 220, s: 14.3, l: 95.9 },
    "--secondary-foreground": { h: 220.9, s: 39.3, l: 11 },
    "--muted": { h: 220, s: 14.3, l: 95.9 },
    "--muted-foreground": { h: 220, s: 8.9, l: 46.1 },
    "--accent": { h: 220, s: 14.3, l: 95.9 },
    "--accent-foreground": { h: 220.9, s: 39.3, l: 11 },
    "--destructive": { h: 0, s: 84.2, l: 60.2 },
    "--border": { h: 220, s: 13, l: 91 },
    "--input": { h: 220, s: 13, l: 91 },
    "--ring": { h: 224, s: 71.4, l: 4.1 },
    "--radius": "0.5rem",
  },
  dark: {
    "--background": { h: 224, s: 71.4, l: 4.1 },
    "--foreground": { h: 210, s: 20, l: 98 },
    "--card": { h: 224, s: 71.4, l: 4.1 },
    "--card-foreground": { h: 210, s: 20, l: 98 },
    "--popover": { h: 224, s: 71.4, l: 4.1 },
    "--popover-foreground": { h: 210, s: 20, l: 98 },
    "--primary": { h: 210, s: 20, l: 98 },
    "--primary-foreground": { h: 220.9, s: 39.3, l: 11 },
    "--secondary": { h: 215, s: 27.9, l: 16.9 },
    "--secondary-foreground": { h: 210, s: 20, l: 98 },
    "--muted": { h: 215, s: 27.9, l: 16.9 },
    "--muted-foreground": { h: 217.9, s: 10.6, l: 64.9 },
    "--accent": { h: 215, s: 27.9, l: 16.9 },
    "--accent-foreground": { h: 210, s: 20, l: 98 },
    "--destructive": { h: 0, s: 62.8, l: 30.6 },
    "--border": { h: 215, s: 27.9, l: 16.9 },
    "--input": { h: 215, s: 27.9, l: 16.9 },
    "--ring": { h: 216, s: 12.2, l: 83.9 },
  },
} as const;

export default gray;
