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
        source: "/d",
        destination: "/",
        permanent: true,
      },
      {
        source: "/issues/new",
        destination: "https://github.com/gridaco/grida/issues/new/choose",
        permanent: true,
      },
      // DO NOT ADD BELOW. this will match all paths with 3 segments.
      // {
      //   source: "/:org/:proj/:id",
      //   destination: "/:org/:proj/:id/data",
      //   permanent: true,
      // },
      // {
      //   source: "/:org/:proj/:id/data",
      //   destination: "/:org/:proj/:id/data/responses",
      //   permanent: true,
      // },
      // {
      //   source: "/:org/:proj/:id/settings",
      //   destination: "/:org/:proj/:id/settings/general",
      //   permanent: true,
      // },
      {
        source: "/:org/:proj/:id/connect",
        destination: "/:org/:proj/:id/connect/share",
        permanent: false,
      },
      {
        // REMOVE ME when migration is complete.
        // 1. db, 2. site static values
        source: "/theme/embed/backgrounds/:path*",
        destination: "https://bg.grida.co/embed/:path*",
        permanent: false,
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
