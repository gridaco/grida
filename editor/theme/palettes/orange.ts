/*
:root {
  --radius: 1rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.141 0.005 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.705 0.213 47.604);
  --primary-foreground: oklch(0.98 0.016 73.684);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --accent: oklch(0.967 0.001 286.375);
  --accent-foreground: oklch(0.21 0.006 285.885);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.92 0.004 286.32);
  --ring: oklch(0.705 0.213 47.604);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.141 0.005 285.823);
  --sidebar-primary: oklch(0.705 0.213 47.604);
  --sidebar-primary-foreground: oklch(0.98 0.016 73.684);
  --sidebar-accent: oklch(0.967 0.001 286.375);
  --sidebar-accent-foreground: oklch(0.21 0.006 285.885);
  --sidebar-border: oklch(0.92 0.004 286.32);
  --sidebar-ring: oklch(0.705 0.213 47.604);
}

.dark {
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.21 0.006 285.885);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.21 0.006 285.885);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.646 0.222 41.116);
  --primary-foreground: oklch(0.98 0.016 73.684);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.274 0.006 286.033);
  --muted-foreground: oklch(0.705 0.015 286.067);
  --accent: oklch(0.274 0.006 286.033);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.646 0.222 41.116);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.21 0.006 285.885);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.646 0.222 41.116);
  --sidebar-primary-foreground: oklch(0.98 0.016 73.684);
  --sidebar-accent: oklch(0.274 0.006 286.033);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.646 0.222 41.116);
}
*/

const orange = {
  light: {
    "--background": { h: 0, s: 0, l: 100 },
    "--foreground": { h: 20, s: 14.3, l: 4.1 },
    "--card": { h: 0, s: 0, l: 100 },
    "--card-foreground": { h: 20, s: 14.3, l: 4.1 },
    "--popover": { h: 0, s: 0, l: 100 },
    "--popover-foreground": { h: 20, s: 14.3, l: 4.1 },
    "--primary": { h: 24.6, s: 95, l: 53.1 },
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
    "--ring": { h: 24.6, s: 95, l: 53.1 },
    "--radius": "0.5rem",
  },
  dark: {
    "--background": { h: 20, s: 14.3, l: 4.1 },
    "--foreground": { h: 60, s: 9.1, l: 97.8 },
    "--card": { h: 20, s: 14.3, l: 4.1 },
    "--card-foreground": { h: 60, s: 9.1, l: 97.8 },
    "--popover": { h: 20, s: 14.3, l: 4.1 },
    "--popover-foreground": { h: 60, s: 9.1, l: 97.8 },
    "--primary": { h: 20.5, s: 90.2, l: 48.2 },
    "--primary-foreground": { h: 60, s: 9.1, l: 97.8 },
    "--secondary": { h: 12, s: 6.5, l: 15.1 },
    "--secondary-foreground": { h: 60, s: 9.1, l: 97.8 },
    "--muted": { h: 12, s: 6.5, l: 15.1 },
    "--muted-foreground": { h: 24, s: 5.4, l: 63.9 },
    "--accent": { h: 12, s: 6.5, l: 15.1 },
    "--accent-foreground": { h: 60, s: 9.1, l: 97.8 },
    "--destructive": { h: 0, s: 72.2, l: 50.6 },
    "--border": { h: 12, s: 6.5, l: 15.1 },
    "--input": { h: 12, s: 6.5, l: 15.1 },
    "--ring": { h: 20.5, s: 90.2, l: 48.2 },
    "--radius": "0.5rem",
  },
} as const;

export default orange;
