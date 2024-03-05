import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      keyframes: {
        panelSlideRightOut: {
          "0%": {
            transform: "translateX(100%)",
            opacity: "0",
          },
          to: {
            transform: "translate-x-0",
            opacity: "1",
          },
        },
        panelSlideLeftOut: {
          "0%": {
            transform: "translateX(-100%)",
            opacity: "0",
          },
          to: {
            transform: "translate-x-0",
            opacity: "1",
          },
        },
        fadeInOverlayBg: {
          "0%": {
            opacity: "0",
          },
          to: {
            opacity: ".75",
          },
        },
      },
    },
  },
  plugins: [],
};
export default config;
