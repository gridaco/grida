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
  type: "dark",
  header: {
    bg: "rgba(0, 0, 0, 0.8)",
    color: "white",
    menu: {
      resting: "rgba(255, 255, 255, 0.55)",
      hover: "white",
    },
    accent: "white",
    // expansion: {
    //   bg: 'black',
    //   shadow: '4px 6px 20px 0 rgba(0, 0, 0, 0.09)',
    //   overlay: {
    //     color: 'rgba(0, 0, 0, 0.3)',
    //   },
    //   color: 'white',
    //   label: { color: 'white' },
    //   tagline: { color: 'rgba(255, 255, 255, 0.55)' },
    // }
  },
  footer: {
    group: {
      color: 'white',
    },
    menu: {
      color: 'rgba(255, 255, 255, 0.5)',
    },
    'bottom': {
      color: 'rgba(255, 255, 255, 0.7)',
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
