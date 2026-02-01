import palettes from "@/theme/palettes";
import { stringifyHSL, stringfyThemeVariables } from "@/theme/palettes/utils";
import { z } from "zod/v3";
import { Theme } from "@/theme/palettes/types";

type ResolvedTheme = z.infer<typeof Theme>;

export type CssVars = Record<`--${string}`, string>;

export type CampaignThemeConfig = {
  palette?: keyof typeof palettes;
  radius?: string;
};

/**
 * Strict CSS length validation for radius overrides.
 * Prevents CSS injection when building inline `<style>` strings.
 *
 * Allowed:
 * - `0`
 * - `<number><unit>` where unit is one of:
 *   px, rem, em, %, ch, ex, cm, mm, in, pt, pc, vh, vw, vmin, vmax
 */
const CSS_LENGTH_RE =
  /^(?:0|(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:px|rem|em|%|ch|ex|cm|mm|in|pt|pc|vh|vw|vmin|vmax))$/;

function sanitizeRadiusOverride(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (CSS_LENGTH_RE.test(v)) return v;
  return "0";
}

function resolvePresetTheme(palette?: string): ResolvedTheme | null {
  if (!palette) return null;
  if (!(palette in palettes)) return null;
  const base = palettes[palette as keyof typeof palettes] as ResolvedTheme;
  return {
    light: { ...base.light },
    dark: { ...base.dark },
  };
}

/**
 * Resolve a campaign theme from palette + small overrides.
 *
 * Returns `null` when no valid palette is present (meaning "use default app theme").
 */
export function resolveCampaignShadcnTheme(
  config?: CampaignThemeConfig | null
): ResolvedTheme | null {
  const theme = resolvePresetTheme(config?.palette);
  if (!theme) return null;

  const radius =
    typeof config?.radius === "string"
      ? sanitizeRadiusOverride(config.radius)
      : null;

  if (radius) {
    theme.light["--radius"] = radius;
    theme.dark["--radius"] = radius;
  }

  return theme;
}

export function campaignShadcnThemeToCssText(theme: ResolvedTheme) {
  return stringfyThemeVariables(theme);
}

/**
 * Return a style object containing the CSS variables for a single scheme.
 * Intended for scoping the theme to a specific subtree via a wrapper `style`.
 */
export function campaignShadcnThemeToInlineStyle(
  theme: ResolvedTheme,
  scheme: "light" | "dark"
): CssVars {
  const palette = theme[scheme];
  const style: CssVars = {};

  for (const key of Object.keys(palette) as Array<keyof typeof palette>) {
    if (key === "--radius") {
      style[key] = palette["--radius"];
      continue;
    }
    style[key] = stringifyHSL(palette[key]);
  }
  return style;
}
