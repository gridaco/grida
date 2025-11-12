import { z } from 'zod/v3';
import type { Theme, Palette } from "../types";

export function stringfyThemeVariables(theme: z.infer<typeof Theme>) {
  // Convert values

  const { light, dark } = theme;

  // Construct the CSS
  const css_1 = stringfyPalette(light);
  const css_2 = stringfyPalette(dark);
  return `:root {
${indent(css_1)}
}

.dark {
${indent(css_2)}
}`;
}

const indent = (str: string) =>
  str
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

const stringifyHSL = (value: { h: number; s: number; l: number } | string) => {
  if (typeof value === "string") {
    if (value.startsWith("hsl")) {
      return value;
    } else {
      return `hsl(${value})`;
    }
  }
  return `hsl(${value.h} ${value.s}% ${value.l}%)`;
};

const stringifyREM = (value: any) => value;

export function stringfyPalette(palette: z.infer<typeof Palette>) {
  return Object.entries(palette)
    .map(([key, value]) => {
      if (key === "--radius") {
        return `${key}: ${stringifyREM(value)};`;
      }
      return `${key}: ${stringifyHSL(value)};`;
    })
    .join("\n");
}
