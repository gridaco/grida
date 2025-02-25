import { ThemeProvider, createTheme } from "@mui/material/styles";

const muitheme = createTheme({
  components: {
    MuiLinearProgress: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: "rgba(255, 255, 255, 0.3)",
        },
        barColorPrimary: {
          backgroundColor: "white",
        },
      },
    },
  },
});

export function MuiThemeProvider({ children }: { children }) {
  return <ThemeProvider theme={muitheme}>{children}</ThemeProvider>;
}
