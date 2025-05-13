import React from "react";
import theme from "theme";
import { ThemeProvider } from "emotion-theming";

export const decorators = [
  Story => <ThemeProvider theme={theme}>{Story()}</ThemeProvider>,
];

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};
