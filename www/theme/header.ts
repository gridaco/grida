import { Color } from "./type";

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
