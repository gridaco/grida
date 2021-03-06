const fs = require('fs');
const fetch = require('node-fetch');
const prettier = require('prettier');

const getDate = new Date().toISOString();

const YOUR_AWESOME_DOMAIN = 'https://bridged.xyz';

const formatted = (sitemap) => prettier.format(sitemap, { parser: 'html' });

(async() => {
        const whatsnewList = [
            'assistant',
            'bridged.xyz',
            'client-sdk-ts',
            'reflect',
            'dynamic',
            'bridged-mobile-app',
            'flutter-builder',
            'CoLI',
            'lint',
            'console.bridged.xyz',
            'context',
            'bridged',
            'reflect-ui-react',
            'chrome-extension',
            'vscode-extension',
            'integrations',
            'engine',
            'nothing',
            'clickclick.design',
            'box',
        ];

        const whatsnewListSitemap = `
    ${whatsnewList
      .map((id) => {
        return `
          <url>
            <loc>${`${YOUR_AWESOME_DOMAIN}/whats-new/${id}`}</loc>
            <lastmod>${getDate}</lastmod>
          </url>`;
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
      ${whatsnewListSitemap}
    </urlset>
  `;

  const formattedSitemap = [formatted(generatedSitemap)];

  fs.writeFileSync('../../web/public/sitemap-whatsnew.xml', formattedSitemap.join(""), 'utf8');
})();