export interface ClipboardPayload {
  payload_id: string;
  prototypes: import("@/grida-canvas").grida.program.nodes.NodePrototype[];
  ids: string[];
}

export function encodeClipboardHtml(payload: ClipboardPayload): string {
  const json = JSON.stringify(payload);
  return `<span data-grida-clipboard='${json}'></span>`;
}

export function decodeClipboardHtml(html: string): ClipboardPayload | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const span = doc.querySelector("[data-grida-clipboard]");
    if (!span) return null;
    const data = span.getAttribute("data-grida-clipboard");
    if (!data) return null;
    return JSON.parse(data) as ClipboardPayload;
  } catch {
    return null;
  }
}
