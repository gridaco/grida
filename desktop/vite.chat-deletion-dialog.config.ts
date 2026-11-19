import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Bundle the dialog as a local asset in dev and in the signed app.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ["react", "react-dom"] },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    cssCodeSplit: false,
    minify: true,
    rollupOptions: {
      output: {
        format: "iife",
        assetFileNames: "chat-deletion-renderer.[ext]",
      },
    },
  },
});
