module.exports = {
  parser: "@typescript-eslint/parser",
  extends: ["plugin:prettier/recommended"],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: [
    "prettier",
    "react",
    "@typescript-eslint",
    "react-hooks",
    "import-helpers",
  ],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "import-helpers/order-imports": "off",
  },
  settings: {
    react: {
      version: "detect",
    },
  },
};
