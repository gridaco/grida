import { Theme } from "styled-system";

export interface ThemeInterface extends Theme {
  colors: {
    primary: string;
  };
  breakpoints: string[];
  buttons: {
    primary: object;
    noShadow: object;
  };
}

const defaultButtonProps = {
  bg: "primary",
  borderRadius: "100px",
  p: "12px 28px",
  fontSize: "16px",
  fontWeight: 500,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.12)",
};

const defaultTheme: ThemeInterface = {
  breakpoints: ["768px", "1024px", "1280px", "1440px"],
  colors: {
    primary: "#2562FF",
  },
  buttons: {
    primary: {
      ...defaultButtonProps,
    },
    noShadow: {
      ...defaultButtonProps,
      boxShadow: "",
    },
  },
};

export default defaultTheme;
