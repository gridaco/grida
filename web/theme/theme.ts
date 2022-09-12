import { Theme as System } from "styled-system";

type Color = React.CSSProperties["color"];
interface _Theme extends System {
  colors: {
    primary: string;
  };
  breakpoints: [
    // ~~ xs ~~
    // sm
    "768px",
    // md
    "1024px",
    // lg
    "1280px",
    // xl
    "1440px",
  ];
  buttons: {
    primary: object;
    noShadow: object;
  };
}
declare module "@emotion/react" {
  export interface Theme extends _Theme {}
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

export type HeaderTheme = {
  bg: Color;
  color: Color;
  menu: {
    resting: Color;
    hover: Color;
  };
  accent: Color;
};

const defaultTheme: _Theme = {
  breakpoints: [
    // ~~ xs ~~
    // sm
    "768px",
    // md
    "1024px",
    // lg
    "1280px",
    // xl
    "1440px",
  ],
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

export type {_Theme as Theme};

export default defaultTheme;

export const theme = {};
