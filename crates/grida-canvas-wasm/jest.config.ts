import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/lib"],
  testMatch: ["**/__test__/**/*.test.ts"],
  collectCoverageFrom: ["lib/**/*.ts", "!lib/**/*.d.ts", "!lib/__test__/**"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/lib/$1",
  },
  testTimeout: 30000, // 30 seconds for WASM loading
};

export default config;
