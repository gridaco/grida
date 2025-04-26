export function getBlurDataURLFromColor(hex: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="${hex}"/></svg>`;
  const base64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}
