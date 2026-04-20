import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["index.ts", "browser.ts", "cli.ts"],
  format: ["esm"],
  outDir: "dist",
  // `eager: true` forces rolldown-plugin-dts to eagerly resolve referenced
  // .d.ts files. Without it, the `declare module "./lib"` augmentation in
  // index.ts causes io-figma's declarations to fail to emit silently,
  // producing spurious MISSING_EXPORT warnings downstream.
  dts: { eager: true },
  deps: {
    // `@figma/rest-api-spec` ships only source `.ts` (no `.d.ts`) under
    // `main: "dist/api_types.ts"`. rolldown-plugin-dts can't load `.ts` as
    // declarations, so we keep this import external in the emitted `.d.ts`
    // and declare it as a peer dep so npm consumers install it themselves.
    neverBundle: ["@grida/canvas-wasm", "commander", "@figma/rest-api-spec"],
    alwaysBundle: [/^@grida\/(?!canvas-wasm$)/],
  },
  clean: true,
});
