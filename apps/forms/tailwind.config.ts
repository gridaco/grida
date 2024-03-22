import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./landing/**/*.{js,ts,jsx,tsx,mdx}",
    "./scaffolds/**/*.{js,ts,jsx,tsx,mdx}",
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
        fadeIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        fadeOut: {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0.95)", opacity: "0" },
        },
        overlayContentShow: {
          "0%": { opacity: "0", transform: "translate(0%, -2%) scale(.96)" },
          "100%": { opacity: "1", transform: "translate(0%, 0%) scale(1)" },
        },
        overlayContentHide: {
          "0%": { opacity: "1", transform: "translate(0%, 0%) scale(1)" },
          "100%": { opacity: "0", transform: "translate(0%, -2%) scale(.96)" },
        },
        dropdownFadeIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        dropdownFadeOut: {
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
        slideDown: {
          "0%": { height: "0", opacity: "0" },
          "100%": {
            height: "var(--radix-accordion-content-height)",
            opacity: "1",
          },
        },
        slideUp: {
          "0%": {
            height: "var(--radix-accordion-content-height)",
            opacity: "1",
          },
          "100%": { height: "0", opacity: "0" },
        },

        slideDownNormal: {
          "0%": { height: "0", opacity: "0" },
          "100%": {
            height: "inherit",
            opacity: "1",
          },
        },
        slideUpNormal: {
          "0%": { height: "inherit", opacity: "1" },
          "100%": { height: "0", opacity: "0" },
        },

        panelSlideLeftOut: {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": {
            transform: "translate-x-0",
            opacity: "1",
          },
        },
        panelSlideLeftIn: {
          "0%": { transform: "translate-x-0", opacity: "1" },
          "100%": { transform: "translateX(-100%)", opacity: "0" },
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
        lineLoading: {
          "0%": {
            marginLeft: "-10%",
            width: "80px",
          },
          "25%": {
            width: " 240px",
          },
          "50%": {
            marginLeft: "100%",
            width: "80px",
          },
          "75%": {
            width: "240px",
          },
          "100%": {
            marginLeft: "-10%",
            width: "80px",
          },
        },
      },
      animation: {
        "fade-in": "fadeIn 300ms both",
        "fade-out": "fadeOut 300ms both",

        "dropdown-content-show":
          "overlayContentShow 100ms cubic-bezier(0.16, 1, 0.3, 1)",
        "dropdown-content-hide":
          "overlayContentHide 100ms cubic-bezier(0.16, 1, 0.3, 1)",

        "overlay-show":
          "overlayContentShow 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        "overlay-hide":
          "overlayContentHide 300ms cubic-bezier(0.16, 1, 0.3, 1)",

        "fade-in-overlay-bg": "fadeInOverlayBg 300ms",
        "fade-out-overlay-bg": "fadeOutOverlayBg 300ms",

        "slide-down": "slideDown 300ms cubic-bezier(0.87, 0, 0.13, 1)",
        "slide-up": "slideUp 300ms cubic-bezier(0.87, 0, 0.13, 1)",

        "slide-down-normal":
          "slideDownNormal 300ms cubic-bezier(0.87, 0, 0.13, 1)",
        "slide-up-normal": "slideUpNormal 300ms cubic-bezier(0.87, 0, 0.13, 1)",

        "panel-slide-left-out":
          "panelSlideLeftOut 200ms cubic-bezier(0.87, 0, 0.13, 1)",
        "panel-slide-left-in":
          "panelSlideLeftIn 250ms cubic-bezier(0.87, 0, 0.13, 1)",
        "panel-slide-right-out":
          "panelSlideRightOut 200ms cubic-bezier(0.87, 0, 0.13, 1)",
        "panel-slide-right-in":
          "panelSlideRightIn 250ms cubic-bezier(0.87, 0, 0.13, 1)",

        "line-loading": "lineLoading 1.8s infinite",
        "line-loading-slower": "lineLoading 2.3s infinite",

        // tailwind class for this is `animate-dropdownFadeIn`
        dropdownFadeIn: "dropdownFadeIn 0.1s ease-out",
        // tailwind class for this is `animate-dropdownFadeOut`
        dropdownFadeOut: "dropdownFadeOut 0.1s ease-out",
      },
    },
    plugins: [require("tailwindcss-animate")],
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
