import { defineConfig, globalIgnores } from "eslint/config";
// import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Temporary disabled nextVitals and dummy rules to prevent "Definition for rule not found" errors
  // ...nextVitals,
  {
    plugins: {
      // Stub plugins to prevent "Definition for rule not found" errors
      // when eslint-disable comments reference these rules
      "react-hooks": {
        rules: {
          "exhaustive-deps": { meta: {} },
          "rules-of-hooks": { meta: {} },
        },
      },
      "jsx-a11y": {
        rules: {
          "alt-text": { meta: {} },
        },
      },
      "@next/next": {
        rules: {
          "no-img-element": { meta: {} },
        },
      },
    },
    rules: {
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "off",
      "jsx-a11y/alt-text": "off",
      "@next/next/no-img-element": "off",
    },
  },
  // Custom rules
  {
    rules: {
      // preserve
      "@typescript-eslint/no-namespace": "off",
      // remove when ready
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
]);

export default eslintConfig;
