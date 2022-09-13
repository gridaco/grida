import { Theme as System } from "styled-system";
import light from "./light"
import dark from "./dark"
import * as defaults from "./shared";

type Color = React.CSSProperties["color"];
type BoxShadow = React.CSSProperties["boxShadow"];

export type HeaderTheme = {
  bg: Color;
  color: Color;
  menu: {
    resting: Color;
    hover: Color;
  };
  accent: Color;
  // expansion: {
  //   bg: Color;
  //   shadow: BoxShadow;
  //   overlay: {
  //     color: Color;
  //   }
  //   color: Color;
  //   label: {color: Color};
  //   tagline: {color: Color};
  // }
};

export type FooterTheme = {
  group: {
    color: Color;
  },
  menu: {
    color: Color;
  },
  bottom: {
    color: Color;
  }
}


interface _Theme extends System {
  type: "light" | "dark";
  header: HeaderTheme;
  footer: FooterTheme;
  colors: {
    primary: string;
  };
  breakpoints: typeof defaults.breakpoints;
  buttons: {
    primary: object;
    noShadow: object;
  };
}
declare module "@emotion/react" {
  export interface Theme extends _Theme {}
}

// eslint-disable-next-line prettier/prettier
export type {_Theme as Theme};

export default {light, dark};
