import { Palette, Theme } from "./types";
import * as csstree from "css-tree";
import { z } from "zod";

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

const stringifyHSL = (value: any) => {
  return `${value.h} ${value.s}% ${value.l}%`;
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

export function parseThemeVariables(css: string) {
  // Parse CSS
  const ast = csstree.parse(css);

  // Extract variables
  const variables: Record<string, string> = {};
  csstree.walk(ast, {
    visit: "Declaration",
    enter(node) {
      const property = node.property;
      const value = csstree.generate(node.value);
      if (property.startsWith("--")) {
        variables[property] = value;
      }
    },
  });

  // Convert values
  const parseHSL = (value: string) => {
    const [h, s, l] = value.split(" ").map((v) => parseFloat(v));
    return { h, s, l };
  };

  const parseREM = (value: string) => value;

  // Construct the theme object
  const theme = Object.fromEntries(
    Object.entries(variables).map(([key, value]) => {
      if (key === "--radius") {
        return [key, parseREM(value)];
      }
      return [key, parseHSL(value)];
    })
  );

  return theme;
}
