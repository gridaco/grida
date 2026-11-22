// A shared loopback fixture for Electron's guest and Chrome's tab favicon.
const { deflateSync, crc32 } = require("node:zlib");

const colors = {
  red: [220, 24, 48],
  green: [29, 151, 77],
  blue: [30, 83, 230],
  purple: [141, 54, 183],
};

function png(rgb, size = 32) {
  function chunk(type, bytes) {
    const body = Buffer.concat([Buffer.from(type), bytes]);
    const frame = Buffer.alloc(8);
    frame.writeUInt32BE(bytes.length);
    frame.writeUInt32BE(crc32(body), 4);
    return Buffer.concat([frame.subarray(0, 4), body, frame.subarray(4)]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header.set([8, 2], 8);
  const row = Buffer.from([
    0,
    ...Array.from({ length: size }, () => rgb).flat(),
  ]);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array(size).fill(row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const icoHeader = Buffer.from(
  "00000100010020200000010020000000000016000000",
  "hex"
);
const fallback = png(colors.purple);
icoHeader.writeUInt32LE(fallback.length, 14);
const ico = Buffer.concat([icoHeader, fallback]);
const gif = Buffer.from([
  ...Buffer.from("GIF89a"),
  1,
  0,
  1,
  0,
  128,
  0,
  0,
  ...colors.green,
  0,
  0,
  0,
  44,
  0,
  0,
  0,
  0,
  1,
  0,
  1,
  0,
  0,
  2,
  2,
  68,
  1,
  0,
  59,
]);
const link = (href, attrs = "") => `<link rel="icon" href="${href}" ${attrs}>`;
const pages = {
  "/icons/nested/relative": [
    '<base href="/art/">',
    link("blue.svg", 'type="image/svg+xml" sizes="any"'),
  ].join(""),
  "/icons/png": link("/art/red.png", 'type="image/png" sizes="32x32"'),
  "/icons/gif": link("/art/green.gif", 'type="image/gif"'),
  "/icons/ico": link("/art/purple.ico"),
  "/icons/size":
    link("/art/green.png", 'sizes="32x32"') +
    link("/art/large-red.png", 'sizes="128x128"'),
  "/icons/theme":
    link("/art/blue.svg", 'sizes="any" media="(prefers-color-scheme: light)"') +
    link("/art/green.svg", 'sizes="any" media="(prefers-color-scheme: dark)"'),
  "/icons/broken":
    link("/art/red.png", 'sizes="32x32"') +
    link("/art/broken.svg", 'sizes="any"'),
  "/icons/fallback": "",
  "/icons/live": link("/art/blue.svg", 'id="current" sizes="any"'),
  "/icons/inline": link(
    "data:image/svg+xml," + encodeURIComponent(svg(colors.blue))
  ),
  "/icons/slow": link("/art/slow.svg", 'sizes="any"'),
};
const cases = [
  ["/icons/nested/relative", "/art/blue.svg", "blue"],
  ["/icons/png", "/art/red.png", "red"],
  ["/icons/gif", "/art/green.gif", "green"],
  ["/icons/ico", "/art/purple.ico", "purple"],
  ["/icons/size", "/art/green.png", "green"],
  ["/icons/theme", "/art/blue.svg", "blue"],
  ["/icons/broken", "/art/red.png", "red"],
  ["/icons/fallback", "/favicon.ico", "purple"],
];

function faviconFixture({ conventional = true } = {}) {
  const requests = new Map();
  const handler = (request, response) => {
    const path = request.url.split("?")[0];
    requests.set(path, (requests.get(path) ?? 0) + 1);
    const send = (type, body) =>
      response
        .writeHead(200, {
          "Content-Type": type,
          "Cache-Control": "public, max-age=60",
        })
        .end(body);
    if (Object.hasOwn(pages, path))
      return send(
        "text/html",
        `<!doctype html><meta charset="utf-8"><title>Icon fixture</title>${pages[path]}<p>Icon fixture</p>`
      );
    if ((path === "/favicon.ico" && conventional) || path === "/art/purple.ico")
      return send("image/x-icon", ico);
    if (path === "/art/green.gif") return send("image/gif", gif);
    if (path === "/art/broken.svg") return send("image/svg+xml", "broken");
    if (path === "/art/slow.svg") {
      const timer = setTimeout(() => {
        if (!response.destroyed) send("image/svg+xml", svg(colors.red));
      }, 400);
      response.once("close", () => clearTimeout(timer));
      return;
    }
    const match = /^\/art\/(large-)?(red|green|blue|purple)\.(png|svg)$/.exec(
      path
    );
    if (match) {
      const [, large, color, format] = match;
      return format === "svg"
        ? send("image/svg+xml", svg(colors[color]))
        : send("image/png", png(colors[color], large ? 128 : 32));
    }
    response.writeHead(404).end();
  };
  return { handler, requests };
}

function svg(rgb) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" fill="rgb(${rgb.join(",")})"/></svg>`;
}

module.exports = { faviconFixture, colors, cases };
