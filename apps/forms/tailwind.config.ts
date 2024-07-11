import type { Config } from "tailwindcss";

const svgToDataUri = require("mini-svg-data-uri");

const colors = require("tailwindcss/colors");

const {
  default: flattenColorPalette,
} = require("tailwindcss/lib/util/flattenColorPalette");

const config: Config = {
  presets: [require("./tailwind.config.ui.js")],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./www/**/*.{js,ts,jsx,tsx,mdx}",
    "./theme/**/*.{js,ts,jsx,tsx,mdx}",
    "./scaffolds/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      borderColor: (theme) => ({
        DEFAULT: `rgb(var(--border-color))`,
      }),
      keyframes: {
        // https://ui.aceternity.com/components/aurora-background
        aurora: {
          from: {
            backgroundPosition: "50% 50%, 50% 50%",
          },
          to: {
            backgroundPosition: "350% 50%, 350% 50%",
          },
        },
        //
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
        // https://ui.aceternity.com/components/aurora-background
        aurora: "aurora 60s linear infinite",
        //
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
  plugins: [
    require("@tailwindcss/typography"),
    require("@tailwindcss/container-queries"),
    addVariablesForColors,
    /**
     * https://ui.aceternity.com/components/grid-and-dot-backgrounds
     */
    function ({ matchUtilities, theme }: any) {
      matchUtilities(
        {
          "bg-grid": (value: any) => ({
            backgroundImage: `url("${svgToDataUri(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="${value}"><path d="M0 .5H31.5V32"/></svg>`
            )}")`,
          }),
          "bg-grid-small": (value: any) => ({
            backgroundImage: `url("${svgToDataUri(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="8" height="8" fill="none" stroke="${value}"><path d="M0 .5H31.5V32"/></svg>`
            )}")`,
          }),
          "bg-dot": (value: any) => ({
            backgroundImage: `url("${svgToDataUri(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16" fill="none"><circle fill="${value}" id="pattern-circle" cx="10" cy="10" r="1.6257413380501518"></circle></svg>`
            )}")`,
          }),
        },
        { values: flattenColorPalette(theme("backgroundColor")), type: "color" }
      );
    },
  ],
};

export default config;

/**
 * @see https://ui.aceternity.com/components/aurora-background
 */
function addVariablesForColors({ addBase, theme }: any) {
  let allColors = flattenColorPalette(theme("colors"));
  let newVars = Object.fromEntries(
    Object.entries(allColors).map(([key, val]) => [`--${key}`, val])
  );

  addBase({
    ":root": newVars,
  });
}
