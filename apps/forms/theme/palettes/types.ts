import { z } from "zod";

export const HSL = z.object({
  h: z.number(),
  s: z.number(),
  l: z.number(),
});

export const REM = z.string();

export const Palette = z.object({
  "--background": HSL,
  "--foreground": HSL,
  "--card": HSL,
  "--card-foreground": HSL,
  "--popover": HSL,
  "--popover-foreground": HSL,
  "--primary": HSL,
  "--primary-foreground": HSL,
  "--secondary": HSL,
  "--secondary-foreground": HSL,
  "--muted": HSL,
  "--muted-foreground": HSL,
  "--accent": HSL,
  "--accent-foreground": HSL,
  "--destructive": HSL,
  "--destructive-foreground": HSL,
  "--border": HSL,
  "--input": HSL,
  "--ring": HSL,
  "--radius": REM,
});

export const Theme = z.object({
  light: Palette,
  dark: Palette,
});
