import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // #region pdfjs @see https://github.com/wojtekmaj/react-pdf?tab=readme-ov-file#nextjs
  turbopack: {
    resolveAlias: {
      canvas: "./empty-module.ts",
    },
  },
  // #endregion
};

export default nextConfig;
