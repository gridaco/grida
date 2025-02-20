import zlib from "zlib";
import { FigmaCommunityArchiveMetaRepository } from "ssg/community";
import { template_urlset } from "utils/sitemap";
/**
 * Generates sitemap urlset for community tag pages
 *
 * This sitemap is referenced from sitemap.xml, post modified by `.scripts/post-sitemap-mod.js`,
 * which the url is rewrited from next.config.js
 *
 * @see
 * - https://vercel.com/guides/how-do-i-generate-a-sitemap-for-my-nextjs-app-on-vercel
 *
 */
export default async function handler(req, res) {
  const { query } = req;
  const index = query.i || 0;

  const service = new FigmaCommunityArchiveMetaRepository();
  const tags = service.tags();

  const _urls_tag = tags.map((tag) => {
    try {
      return {
        loc: `https://code.grida.co/community/tag/${tag}/files`,
        lastmod: new Date().toISOString(),
        changefreq: "weekly",
        priority: 0.6,
      };
    } catch (e) {}
  });

  const urls = _urls_tag.splice(index * 50000, (index + 1) * 50000);

  const xml = template_urlset(urls);
  const xmlgz = zlib.gzipSync(xml);

  res.statusCode = 200;
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Length", xmlgz.length);
  res.setHeader("Cache-Control", "public, max-age=604800"); // 1 week
  res.write(xmlgz);
  res.end();
}
