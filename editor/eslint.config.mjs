import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextTs,
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Custom rules
  {
    rules: {
      // preserve
      "@typescript-eslint/no-namespace": "off",
      // remove when ready
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  // Progressive enablement:
  // keep one rule on, "mock" (disable) the rest for now.
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      // =========================
      // ✅ ENABLED (ON) RULES
      // =========================
      "react/display-name": "error",
      "react/no-danger-with-children": "error",
      "react/jsx-key": "error",
      "import/no-anonymous-default-export": "error",

      // =========================
      // 💤 TEMPORARILY DISABLED (MOCKED) RULES
      // =========================
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/static-components": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/refs": "off",
      "jsx-a11y/role-has-required-aria-props": "off",
      "jsx-a11y/alt-text": "off",
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
