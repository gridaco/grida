/**
 * @deprecated
 */
const slate = {
  light: {
    "--background": { h: 0, s: 0, l: 100 },
    "--foreground": { h: 222.2, s: 84, l: 4.9 },
    "--card": { h: 0, s: 0, l: 100 },
    "--card-foreground": { h: 222.2, s: 84, l: 4.9 },
    "--popover": { h: 0, s: 0, l: 100 },
    "--popover-foreground": { h: 222.2, s: 84, l: 4.9 },
    "--primary": { h: 222.2, s: 47.4, l: 11.2 },
    "--primary-foreground": { h: 210, s: 40, l: 98 },
    "--secondary": { h: 210, s: 40, l: 96.1 },
    "--secondary-foreground": { h: 222.2, s: 47.4, l: 11.2 },
    "--muted": { h: 210, s: 40, l: 96.1 },
    "--muted-foreground": { h: 215.4, s: 16.3, l: 46.9 },
    "--accent": { h: 210, s: 40, l: 96.1 },
    "--accent-foreground": { h: 222.2, s: 47.4, l: 11.2 },
    "--destructive": { h: 0, s: 84.2, l: 60.2 },
    "--border": { h: 214.3, s: 31.8, l: 91.4 },
    "--input": { h: 214.3, s: 31.8, l: 91.4 },
    "--ring": { h: 222.2, s: 84, l: 4.9 },
    "--radius": "0.5rem",
  },
  dark: {
    "--background": { h: 222.2, s: 84, l: 4.9 },
    "--foreground": { h: 210, s: 40, l: 98 },
    "--card": { h: 222.2, s: 84, l: 4.9 },
    "--card-foreground": { h: 210, s: 40, l: 98 },
    "--popover": { h: 222.2, s: 84, l: 4.9 },
    "--popover-foreground": { h: 210, s: 40, l: 98 },
    "--primary": { h: 210, s: 40, l: 98 },
    "--primary-foreground": { h: 222.2, s: 47.4, l: 11.2 },
    "--secondary": { h: 217.2, s: 32.6, l: 17.5 },
    "--secondary-foreground": { h: 210, s: 40, l: 98 },
    "--muted": { h: 217.2, s: 32.6, l: 17.5 },
    "--muted-foreground": { h: 215, s: 20.2, l: 65.1 },
    "--accent": { h: 217.2, s: 32.6, l: 17.5 },
    "--accent-foreground": { h: 210, s: 40, l: 98 },
    "--destructive": { h: 0, s: 62.8, l: 30.6 },
    "--border": { h: 217.2, s: 32.6, l: 17.5 },
    "--input": { h: 217.2, s: 32.6, l: 17.5 },
    "--ring": { h: 212.7, s: 26.8, l: 83.9 },
    "--radius": "0.5rem",
  },
} as const;

export default slate;
