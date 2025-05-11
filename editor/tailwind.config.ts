import type { Config } from "tailwindcss";

const config: Config = {
  presets: [require("./tailwind.config.ui.js")],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./www/**/*.{js,ts,jsx,tsx,mdx}",
    "./theme/**/*.{js,ts,jsx,tsx,mdx}",
    "./kits/**/*.{js,ts,jsx,tsx,mdx}",
    "./scaffolds/**/*.{js,ts,jsx,tsx,mdx}",
    "./grida-react-canvas/**/*.{js,ts,jsx,tsx,mdx}",
    "./grida-react-canvas-starter-kit/**/*.{js,ts,jsx,tsx,mdx}",
    "./grida-theme-shadcn/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      borderColor: (theme) => ({
        DEFAULT: `rgb(var(--border-color))`,
      }),
      keyframes: {
        fadeIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        fadeOut: {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0.95)", opacity: "0" },
        },
        fadeInOverlayBg: {
          "0%": { opacity: "0" },
          "100%": { opacity: "0.75" },
        },
        fadeOutOverlayBg: {
          "0%": { opacity: "0.75" },
          "100%": { opacity: "0" },
        },
        panelSlideRightOut: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": {
            transform: "translate-x-0",
            opacity: "1",
          },
        },
        panelSlideRightIn: {
          "0%": { transform: "translate-x-0", opacity: "1" },
          "100%": { transform: "translateX(100%)", opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fadeIn 300ms both",
        "fade-out": "fadeOut 300ms both",

        "fade-in-overlay-bg": "fadeInOverlayBg 300ms",
        "fade-out-overlay-bg": "fadeOutOverlayBg 300ms",

        "panel-slide-right-out":
          "panelSlideRightOut 200ms cubic-bezier(0.87, 0, 0.13, 1)",
        "panel-slide-right-in":
          "panelSlideRightIn 250ms cubic-bezier(0.87, 0, 0.13, 1)",
      },
    },
    plugins: [require("tailwindcss-animate")],
  },
  plugins: [
    require("@tailwindcss/typography"),
    require("@tailwindcss/container-queries"),
  ],
};

export default config;
