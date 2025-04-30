import withMDX from "@next/mdx";

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.grida.co";
const BLOG_URL = process.env.NEXT_PUBLIC_BLOG_URL || "https://blog.grida.co";

/** @type {import('next').NextConfig} */
const nextConfig = withMDX()({
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  experimental: {
    mdxRs: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
      },
      {
        protocol: "https",
        hostname: "mozagqllybnbytfcmvdh.supabase.co",
      },
      {
        protocol: "https",
        hostname: "mozagqllybnbytfcmvdh-all.supabase.co",
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
      {
        protocol: "https",
        hostname: "images.unsplash.com",
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
      // static pages from docs
      {
        source: "/terms",
        destination: "/docs/support/terms-and-conditions",
        permanent: true,
      },
      {
        source: "/privacy",
        destination: "/docs/support/privacy-policy",
        permanent: true,
      },
      {
        source: "/privacy-policy",
        destination: "/docs/support/privacy-policy",
        permanent: false,
      },
      {
        source: "/terms-and-conditions",
        destination: "/docs/support/terms-and-conditions",
        permanent: false,
      },
      {
        source: "/cookies-policy",
        destination: "/docs/support/cookies-policy",
        permanent: false,
      },
      // [Legacy]
      // code.grida.co
      {
        source: "/code",
        destination: "https://code.grida.co",
        permanent: false,
      },
      {
        source: "/figma",
        destination: "https://legacy.grida.co",
        permanent: false,
      },
      // Static redirects
      {
        source: "/join-slack",
        destination:
          "https://join.slack.com/t/gridaco/shared_invite/zt-nmf59381-prFEqq032K~aWe_zOekUmQ",
        permanent: true,
      },
      {
        source: "/github",
        destination: "https://github.com/gridaco",
        permanent: true,
      },
      {
        source: "/download",
        destination: "/downloads",
        permanent: true,
      },
    ];
  },
  rewrites: async () => {
    return [
      // docs
      {
        source: "/docs/:path*",
        destination: `${DOCS_URL}/:path*`,
      },
      {
        source: "/blog/:path*",
        destination: `${BLOG_URL}/:path*`,
      },
      // The-Bundle
      {
        source: "/bundle",
        destination: `https://the-bundle-web.vercel.app/bundle`,
      },
      {
        source: "/bundle/:path*",
        destination: `https://the-bundle-web.vercel.app/bundle/:path*`,
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
