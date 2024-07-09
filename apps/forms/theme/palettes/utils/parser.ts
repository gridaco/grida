//
// NOTE - this file is not used and has a issue on deployment
// css-tree will complain about the following error:
// Error: Cannot find module '../data/patch.json'
//
import * as csstree from "css-tree";

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
