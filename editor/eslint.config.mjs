import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const PROGRESSIVE_ENABLEMENT = process.env.GRIDA_ESLINT_PROGRESSIVE !== "0";

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
  ...(PROGRESSIVE_ENABLEMENT
    ? [
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
            "jsx-a11y/alt-text": "error",

            // =========================
            // 💤 TEMPORARILY DISABLED (MOCKED) RULES
            // =========================
            "react/display-name": "off",
            "react/no-danger-with-children": "off",
            "react/jsx-key": "off",
            "import/no-anonymous-default-export": "off",
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
            "@next/next/no-img-element": "off",
          },
        },
      ]
    : []),
]);

export default eslintConfig;
