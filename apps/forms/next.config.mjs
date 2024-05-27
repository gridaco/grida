import withMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = withMDX()({
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  experimental: {
    mdxRs: true,
  },
  webpack: (config) => {
    // https://github.com/wojtekmaj/react-pdf?tab=readme-ov-file#nextjs
    config.resolve.alias.canvas = false;
    // https://github.com/handlebars-lang/handlebars.js/issues/953#issuecomment-239874313
    config.resolve.alias.handlebars = "handlebars/dist/handlebars.js";
    return config;
  },
});

export default nextConfig;
