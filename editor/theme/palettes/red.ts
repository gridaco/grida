/*
:root {
  --radius: 1rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.141 0.005 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.637 0.237 25.331);
  --primary-foreground: oklch(0.971 0.013 17.38);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --accent: oklch(0.967 0.001 286.375);
  --accent-foreground: oklch(0.21 0.006 285.885);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.92 0.004 286.32);
  --ring: oklch(0.637 0.237 25.331);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.141 0.005 285.823);
  --sidebar-primary: oklch(0.637 0.237 25.331);
  --sidebar-primary-foreground: oklch(0.971 0.013 17.38);
  --sidebar-accent: oklch(0.967 0.001 286.375);
  --sidebar-accent-foreground: oklch(0.21 0.006 285.885);
  --sidebar-border: oklch(0.92 0.004 286.32);
  --sidebar-ring: oklch(0.637 0.237 25.331);
}

.dark {
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.21 0.006 285.885);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.21 0.006 285.885);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.637 0.237 25.331);
  --primary-foreground: oklch(0.971 0.013 17.38);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.274 0.006 286.033);
  --muted-foreground: oklch(0.705 0.015 286.067);
  --accent: oklch(0.274 0.006 286.033);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.637 0.237 25.331);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.21 0.006 285.885);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.637 0.237 25.331);
  --sidebar-primary-foreground: oklch(0.971 0.013 17.38);
  --sidebar-accent: oklch(0.274 0.006 286.033);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.637 0.237 25.331);
}
*/

const red = {
  light: {
    "--background": { h: 0, s: 0, l: 100 },
    "--foreground": { h: 0, s: 0, l: 3.9 },
    "--card": { h: 0, s: 0, l: 100 },
    "--card-foreground": { h: 0, s: 0, l: 3.9 },
    "--popover": { h: 0, s: 0, l: 100 },
    "--popover-foreground": { h: 0, s: 0, l: 3.9 },
    "--primary": { h: 0, s: 72.2, l: 50.6 },
    "--primary-foreground": { h: 0, s: 85.7, l: 97.3 },
    "--secondary": { h: 0, s: 0, l: 96.1 },
    "--secondary-foreground": { h: 0, s: 0, l: 9 },
    "--muted": { h: 0, s: 0, l: 96.1 },
    "--muted-foreground": { h: 0, s: 0, l: 45.1 },
    "--accent": { h: 0, s: 0, l: 96.1 },
    "--accent-foreground": { h: 0, s: 0, l: 9 },
    "--destructive": { h: 0, s: 84.2, l: 60.2 },
    "--border": { h: 0, s: 0, l: 89.8 },
    "--input": { h: 0, s: 0, l: 89.8 },
    "--ring": { h: 0, s: 72.2, l: 50.6 },
    "--radius": "0.5rem",
  },
  dark: {
    "--background": { h: 0, s: 0, l: 3.9 },
    "--foreground": { h: 0, s: 0, l: 98 },
    "--card": { h: 0, s: 0, l: 3.9 },
    "--card-foreground": { h: 0, s: 0, l: 98 },
    "--popover": { h: 0, s: 0, l: 3.9 },
    "--popover-foreground": { h: 0, s: 0, l: 98 },
    "--primary": { h: 0, s: 72.2, l: 50.6 },
    "--primary-foreground": { h: 0, s: 85.7, l: 97.3 },
    "--secondary": { h: 0, s: 0, l: 14.9 },
    "--secondary-foreground": { h: 0, s: 0, l: 98 },
    "--muted": { h: 0, s: 0, l: 14.9 },
    "--muted-foreground": { h: 0, s: 0, l: 63.9 },
    "--accent": { h: 0, s: 0, l: 14.9 },
    "--accent-foreground": { h: 0, s: 0, l: 98 },
    "--destructive": { h: 0, s: 62.8, l: 30.6 },
    "--border": { h: 0, s: 0, l: 14.9 },
    "--input": { h: 0, s: 0, l: 14.9 },
    "--ring": { h: 0, s: 72.2, l: 50.6 },
    "--radius": "0.5rem",
  },
} as const;

export default red;
