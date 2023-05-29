export function openInFigma(filekey: string, node?: string) {
  return `https://www.figma.com/file/${filekey}${
    node ? `?node-id=${node}` : ""
  }`;
}
