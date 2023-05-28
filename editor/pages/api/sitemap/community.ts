// 1. /community/files/:id
// 2. /community/tag/:tag
import { FigmaCommunityArchiveMetaRepository } from "ssg/community";
/**
 * Generates sitemap urlset for community pages
 *
 * This sitemap is referenced from sitemap.xml, post modified by `.scripts/post-sitemap-mod.js`,
 * which the url is rewrited from next.config.js
 *
 * @see
 * - https://vercel.com/guides/how-do-i-generate-a-sitemap-for-my-nextjs-app-on-vercel
 */
export default async function handler(req, res) {
  const service = new FigmaCommunityArchiveMetaRepository();
  const files = service.all();
  const urls = files.map((file) => {
    try {
      // drop T and Z
      const lastmod = new Date(file.created_at).toISOString().split("T")[0];
      return {
        loc: `https://code.grida.co/community/file/${file.id}`,
        lastmod: lastmod,
        changefreq: "weekly",
        priority: 0.8,
      };
    } catch (e) {
      console.log(file);
      console.log(e);
    }
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:mobile="http://www.google.com/schemas/sitemap-mobile/1.0" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls
  .map((url) => {
    return `<url>${xmll(url)}</url>`;
  })
  .join("\n")}
</urlset>
  `;
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/xml");
  res.setHeader("Cache-control", "stale-while-revalidate, s-maxage=3600");
  res.write(xml);
  res.end();
}

/**
 * simple xml line builder
 *
 * @example
 * xml({ loc: 'https://example.com', lastmod: '2021-01-01' })
 * // <loc>https://example.com</loc><lastmod>2021-01-01</lastmod>
 *
 */
function xmll(item: { [key: string]: string | number | boolean }) {
  return Object.keys(item)
    .map((key) => {
      return `<${key}>${item[key]}</${key}>`;
    })
    .join("");
}
