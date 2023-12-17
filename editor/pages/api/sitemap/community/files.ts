import zlib from "zlib";
import { FigmaCommunityArchiveMetaRepository } from "ssg/community";
import { template_urlset } from "utils/sitemap";
/**
 * Generates sitemap urlset for community file pages
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
  const files = service.all();

  const _urls_index = files.map((file) => {
    try {
      // TODO: we have to use last updated time instead of created time
      const lastmod = new Date(file.created_at).toISOString();
      return {
        loc: `https://code.grida.co/community/file/${file.id}`,
        lastmod: lastmod,
        changefreq: "weekly",
        priority: 0.7,
      };
    } catch (e) {}
  });

  const urls = _urls_index.splice(index * 50000, (index + 1) * 50000);

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
