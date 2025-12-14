import type { Config } from "jest";

const config: Config = {
  // Needed because `svg-pathdata` is ESM-only ("type": "module")
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  collectCoverageFrom: [
    "**/*.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
    "!dist/**",
  ],
  extensionsToTreatAsEsm: [".ts"],
};

export default config;
