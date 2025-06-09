import type { NextConfig } from "next";
import { Platform } from "@/lib/platform";
import { withSentryConfig, type SentryBuildOptions } from "@sentry/nextjs";
import createMDX from "@next/mdx";

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.grida.co";
const BLOG_URL = process.env.NEXT_PUBLIC_BLOG_URL || "https://blog.grida.co";
const USE_TELEMETRY =
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_GRIDA_USE_TELEMETRY === "1";

const withMDX = createMDX({
  // Add markdown plugins here, as desired
});

const nextConfig: NextConfig = {
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
      // /login => /sign-in
      {
        source: "/login",
        destination: "/sign-in",
        permanent: true,
      },
      // /d
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
  headers: async () => {
    return [
      {
        source: "/v1/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: [
              "Content-Type",
              "Authorization",
              ...Object.values(Platform.headers),
            ].join(", "),
          },
        ],
      },
    ];
  },
  turbopack: {
    resolveAlias: {
      // #region pdfjs @see https://github.com/wojtekmaj/react-pdf?tab=readme-ov-file#nextjs
      canvas: "./empty-module.ts",
      // #endregion
    },
  },
  webpack: (config, { isServer }) => {
    // #region canvaskit-wasm (canvaskit-wasm `requires` fs and path)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    // #endregion

    // #region handlebars https://github.com/handlebars-lang/handlebars.js/issues/1174#issuecomment-229918935
    config.resolve.alias.handlebars = "handlebars/dist/handlebars.min.js";
    // #endregion
    return config;
  },
};

const sentry_build_options: SentryBuildOptions | null = USE_TELEMETRY
  ? ({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI, // Only print logs for uploading source maps in CI
      widenClientFileUpload: false,
      sourcemaps: {
        disable: true,
        // [causes build time out error - enable once fixed]
        // disable:
        //   process.env.NODE_ENV === "development" ||
        //   process.env.VERCEL_ENV === "preview",
      },

      // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
      // This can increase your server load as well as your hosting bill.
      // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
      // side errors will fail.
      tunnelRoute: "/monitoring",

      // Automatically tree-shake Sentry logger statements to reduce bundle size
      disableLogger: true,

      // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
      // See the following for more information:
      // https://docs.sentry.io/product/crons/
      // https://vercel.com/docs/cron-jobs
      automaticVercelMonitors: false,
    } satisfies SentryBuildOptions)
  : null;

export default sentry_build_options
  ? withSentryConfig(withMDX(nextConfig as any), sentry_build_options)
  : withMDX(nextConfig as any);
