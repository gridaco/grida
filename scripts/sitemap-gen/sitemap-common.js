const fs = require('fs');
const globby = require('globby');
const prettier = require('prettier');

const getDate = new Date().toISOString();

const BRIDGED_DOMAIN = 'https://bridged.xyz';

const formatted = (sitemap) => prettier.format(sitemap, { parser: 'html' });

(async() => {
        const pages = await globby([
            // include
            '../../web/pages/**/*.tsx',
            '../../web/pages/*.tsx',
            '../../web/pages/*.js',
            '../pages/**/*.js',
            // exclude
            '!../../web/pages/_*.tsx',
            '!../../web/pages/_*.js',
        ]);

        const pagesSitemap = `
    ${pages
      .map((page) => {
        const path = page
          .replace('../../web/pages/', '')
          .replace('.tsx', '')
          .replace('.js', '')
          .replace(/\/index/g, '');
        const routePath = path === 'index' ? '' : path;
        return `
          <url>
            <loc>${BRIDGED_DOMAIN}/${routePath}</loc>
            <lastmod>${getDate}</lastmod>
          </url>
        `;
      })
      .join('')}
  `;

  const generatedSitemap = `
    <?xml version="1.0" encoding="UTF-8"?>
    <urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd"
    >
      ${pagesSitemap}
    </urlset>
  `;

  const formattedSitemap = [formatted(generatedSitemap)];

  fs.writeFileSync(
    '../../web/public/sitemap-common.xml',
    formattedSitemap.join(''),
    'utf8',
  );
})();