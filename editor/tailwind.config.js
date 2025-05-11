const colors = require("tailwindcss/colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      colors: {
        // custom extended
        "workbench-accent-sky": {
          DEFAULT: colors.sky[500],
        },
        "workbench-accent-violet": {
          DEFAULT: colors.violet[500],
        },
        "workbench-accent-orange": {
          DEFAULT: colors.orange[400],
        },
        "workbench-accent-red": {
          DEFAULT: colors.red[500],
        },
      },
    },
  },
};
