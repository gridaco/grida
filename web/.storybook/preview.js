import React from "react";
import { defaultTheme } from "utils/styled";
import { ThemeProvider } from "emotion-theming";

export const decorators = [
  Story => <ThemeProvider theme={defaultTheme}>{Story()}</ThemeProvider>,
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
