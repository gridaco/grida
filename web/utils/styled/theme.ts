import { Theme } from "styled-system";

export interface ThemeInterface extends Theme {
  colors: {
    primary: string;
    secondary: string;
    gray5: string;
    gray10: string;
    gray30: string;
    gray40: string;
    gray60: string;
    gray80: string;
    gray90: string;
    gray100: string;
    newSecondary: string;
  };
  breakpoints: string[];
  buttons: {
    primary: object,
    secondary: object,
    disabled: object,
  };
}

const defaultButtonProps = {
  bg: "primary",
  borderRadius: "60px",
  p: "6px 20px",
  fontSize: "16px",
  fontWeight: 500,
  cursor: "pointer",
};

const defaultTheme: ThemeInterface = {
  breakpoints: ["320px", "768px", "1024px", "1280px"],
  colors: {
    primary: "#2562FF",
    secondary: "#F6EEC1",
    gray5: "#fbfbfb",
    gray10: "#f2f2f2",
    gray30: "#f1f1f1",
    gray40: "#e6e6e6",
    gray60: "#d9d9d9",
    gray80: "#c8c8c8",
    gray90: "#6e6e6e",
    gray100: "#3e3e3e",
    newSecondary: "#F6EEC1",
  },
  buttons: {
    primary: {
      ...defaultButtonProps,
    },
    secondary: {
      ...defaultButtonProps,
      bg: "white",
      border: "2px solid",
      borderColor: "primary",
      p: "13px 25px",
      color: "primary",
      ":hover": {
        bg: "secondary",
      },
    },
    disabled: {
      ...defaultButtonProps,
      bg: "gray80",
      color: "white",
      cursor: "not-allowed",
    },
  },
};

export default defaultTheme;
