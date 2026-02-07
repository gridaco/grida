import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// PROGRESSIVE_ENABLEMENT
// The editor's ESLint setup is intentionally **partial** today.
//
// We want `eslint-config-next/core-web-vitals` enabled long-term, but turning it
// on all at once currently produces too many violations to fix in one pass.
//
// With progressive enablement on (default), we keep a single chosen rule
// enabled and "mock" (disable) the rest, then migrate rule-by-rule.
//
// Set `GRIDA_ESLINT_PROGRESSIVE=0` to disable this gate and see the full,
// unmocked rule set (useful to measure total remaining work).
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
      "@typescript-eslint/no-empty-object-type": "off",
      // remove when ready
      "@typescript-eslint/no-explicit-any": "off",
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
            // 💤 TEMPORARILY DISABLED (MOCKED) RULES
            // =========================
            "react-hooks/exhaustive-deps": "off",
            "react-hooks/rules-of-hooks": "off",
            "react-hooks/set-state-in-effect": "off",
            "react-hooks/preserve-manual-memoization": "off",
            "react-hooks/purity": "off",
            "react-hooks/refs": "off",
          },
        },
      ]
    : []),
]);

export default eslintConfig;
