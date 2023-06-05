/**
 * simple xml line builder
 *
 * @example
 * xml({ loc: 'https://example.com', lastmod: '2021-01-01' })
 * // <loc>https://example.com</loc><lastmod>2021-01-01</lastmod>
 *
 */
export function xmll(item: { [key: string]: string | number | boolean }) {
  return Object.keys(item)
    .map((key) => {
      return `<${key}>${item[key]}</${key}>`;
    })
    .join("");
}

export const template_urlset = (
  urls: {
    loc: string;
    lastmod?: string;
    changefreq?: string; // google ignores this
    priority?: number; // google ignores this
  }[]
) => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:mobile="http://www.google.com/schemas/sitemap-mobile/1.0" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls
  .map((url) => {
    return `<url>${xmll(url)}</url>`;
  })
  .join("\n")}
</urlset>
  `;
};
