// eslint-disable-next-line
import type { Theme } from "./theme";
import * as defaults from "./shared";

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

export default <Theme>{
  type: "light",
  header: {
    bg: "white",
    color: "black",
    menu: {
      resting: "rgba(0, 0, 0, 0.55)",
      hover: "black",
    },
    accent: "#2562FF",
    // expansion: {
    //   bg: 'white',
    //   shadow: '4px 6px 20px 0 rgba(0, 0, 0, 0.09)',
    //   overlay: {
    //     color: 'rgba(0, 0, 0, 0.5)',
    //   },
    //   color: 'black',
    //   label: { color: 'black' },
    //   tagline: { color: 'rgba(0, 0, 0, 0.55)' },
    // }
  },
  footer: {
    group: {
      color: 'black',
    },
    menu: {
      color: '#292929',
    },
    'bottom': {
      color: '#4e4e4e',
    }
  },
  breakpoints: defaults.breakpoints,
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
