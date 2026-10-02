import { defineConfig } from "tsdown";
export default defineConfig({
  entry: ["src/http.ts", "src/otp.ts"],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
});
