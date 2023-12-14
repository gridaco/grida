module.exports = {
  siteUrl: process.env.SITE_URL || "https://grida.co",
  changefreq: "weekly",
  priority: 1,
  sitemapSize: 5000,
  generateRobotsTxt: true,
  exclude: ["/legacy-docs/*", "/figma-instant-auth-callback"],
  robotsTxtOptions: {
    policies: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    additionalSitemaps: ["https://grida.co/docs/sitemap.xml"],
  },
};
