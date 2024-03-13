/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./scaffolds/**/*.{js,ts,jsx,tsx,mdx}",
    "./renderers/**/*.{js,ts,jsx,tsx,mdx}",
    "../ui/**/*.{js,ts,jsx,tsx}",
    "../editor-packages/editor-craft/lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
