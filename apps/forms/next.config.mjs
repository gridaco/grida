import withMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = withMDX()({
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  experimental: {
    mdxRs: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "mozagqllybnbytfcmvdh.supabase.co",
      },
      {
        protocol: "https",
        hostname: "base.grida.co",
      },
      {
        protocol: "https",
        hostname: "bg.grida.co",
      },
      {
        protocol: "https",
        hostname: "backgrounds.grida.co",
      },
    ],
  },
  async redirects() {
    return [
      {
        // REMOVE ME when migration is complete.
        // 1. db, 2. site static values
        source: "/theme/embed/backgrounds/:path*",
        destination: "https://backgrounds.grida.co/embed/:path*",
        permanent: true,
      },
    ];
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
