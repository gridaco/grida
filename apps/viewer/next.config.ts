import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // #region pdfjs @see https://github.com/wojtekmaj/react-pdf?tab=readme-ov-file#nextjs
  experimental: {
    turbo: {
      resolveAlias: {
        canvas: "./empty-module.ts",
      },
    },
  },
  swcMinify: false,
  // #endregion
};

export default nextConfig;
