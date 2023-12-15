const { i18n } = require("./next-i18next.config");

/**
 * @type {import('next').NextConfig}
 */
const nextconfig = {
  i18n,
  images: {
    domains: ["img.youtube.com", "via.placeholder.com"],
  },
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  async rewrites() {
    return [
      {
        source: "/:path*",
        destination: `/:path*`,
      },
      {
        source: "/docs/:path*",
        destination: `${process.env.NEXT_PUBLIC_DOCS_URL}/:path*`,
      },
      {
        source: "/lsd",
        destination: `https://lsd-web.vercel.app/lsd`,
      },
      {
        source: "/lsd/:path*",
        destination: `https://lsd-web.vercel.app/lsd/:path*`,
      },
      {
        source: "/bundle",
        destination: `https://the-bundle-web.vercel.app/bundle`,
      },
      {
        source: "/bundle/:path*",
        destination: `https://the-bundle-web.vercel.app/bundle/:path*`,
      },
      {
        source: "/dynamix",
        destination: `https://dynamix-www.vercel.app/dynamix`,
      },
      {
        source: "/dynamix/:path*",
        destination: `https://dynamix-www.vercel.app/dynamix/:path*`,
      },
      {
        source: "/kits",
        destination: `https://kits.grida.vercel.app/kits`,
      },
      {
        source: "/kits/:path*",
        destination: `https://kits.grida.vercel.app/kits/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/terms",
        destination: "/docs/support/terms-and-conditions",
        permanent: true,
        locale: false,
      },
      {
        source: "/privacy",
        destination: "/docs/support/privacy-policy",
        permanent: true,
        locale: false,
      },
      // disabling globalization page access since it's not fully implemented. (temporary)
      {
        source: "/globalization",
        destination: "/",
        permanent: false,
      },
      {
        source: "/code",
        destination: "https://code.grida.co",
        permanent: false,
      },
      {
        source: "/console",
        destination: "https://console.grida.co",
        permanent: false,
      },
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
        source: "/join-us",
        destination: "/careers/",
        permanent: true,
      },
      {
        source: "/jobs",
        destination: "/careers",
        permanent: true,
      },
      // legal documents
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
      //
      {
        source: "/cloud/cors",
        destination: "https://cors.sh",
        permanent: false,
      },
      {
        // Legacy. keep this for a while.
        source: "/cloud/cors/register",
        destination: "https://cors.sh",
        permanent: true,
      },
      // events
      {
        source: "/monothon",
        destination: "https://forms.gle/7TfBmiw22rz5SuAS9",
        permanent: false,
      },
    ];
  },
};

module.exports = nextconfig;
