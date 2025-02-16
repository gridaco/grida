export function openInFigma(filekey: string, node?: string) {
  open(
    `https://www.figma.com/file/${filekey}${node ? `?node-id=${node}` : ""}`
  );
}
