/*
:root {
  --radius: 1rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.141 0.005 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.623 0.214 259.815);
  --primary-foreground: oklch(0.97 0.014 254.604);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --accent: oklch(0.967 0.001 286.375);
  --accent-foreground: oklch(0.21 0.006 285.885);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.92 0.004 286.32);
  --ring: oklch(0.623 0.214 259.815);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.141 0.005 285.823);
  --sidebar-primary: oklch(0.623 0.214 259.815);
  --sidebar-primary-foreground: oklch(0.97 0.014 254.604);
  --sidebar-accent: oklch(0.967 0.001 286.375);
  --sidebar-accent-foreground: oklch(0.21 0.006 285.885);
  --sidebar-border: oklch(0.92 0.004 286.32);
  --sidebar-ring: oklch(0.623 0.214 259.815);
}

.dark {
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.21 0.006 285.885);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.21 0.006 285.885);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.546 0.245 262.881);
  --primary-foreground: oklch(0.379 0.146 265.522);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.274 0.006 286.033);
  --muted-foreground: oklch(0.705 0.015 286.067);
  --accent: oklch(0.274 0.006 286.033);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.488 0.243 264.376);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.21 0.006 285.885);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.546 0.245 262.881);
  --sidebar-primary-foreground: oklch(0.379 0.146 265.522);
  --sidebar-accent: oklch(0.274 0.006 286.033);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.488 0.243 264.376);
}
*/
const blue = {
  light: {
    "--background": { h: 0, s: 0, l: 100 },
    "--foreground": { h: 222.2, s: 84, l: 4.9 },
    "--card": { h: 0, s: 0, l: 100 },
    "--card-foreground": { h: 222.2, s: 84, l: 4.9 },
    "--popover": { h: 0, s: 0, l: 100 },
    "--popover-foreground": { h: 222.2, s: 84, l: 4.9 },
    "--primary": { h: 221.2, s: 83.2, l: 53.3 },
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
    "--ring": { h: 221.2, s: 83.2, l: 53.3 },
    "--radius": "0.5rem",
  },
  dark: {
    "--background": { h: 222.2, s: 84, l: 4.9 },
    "--foreground": { h: 210, s: 40, l: 98 },
    "--card": { h: 222.2, s: 84, l: 4.9 },
    "--card-foreground": { h: 210, s: 40, l: 98 },
    "--popover": { h: 222.2, s: 84, l: 4.9 },
    "--popover-foreground": { h: 210, s: 40, l: 98 },
    "--primary": { h: 217.2, s: 91.2, l: 59.8 },
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
    "--ring": { h: 224.3, s: 76.3, l: 48 },
    "--radius": "0.5rem",
  },
} as const;

export default blue;
