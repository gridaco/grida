/** GRIDA-SEC-016 — isolated browser click intents; no application bridge. */
import { ipcRenderer } from "electron";

// Trusted top-document anchors carry tab or external-app click intent only.
// Scripted, named and form-created windows retain native window-open behavior.
function link(event: MouseEvent): void {
  if (
    !event.isTrusted ||
    event.defaultPrevented ||
    event.altKey ||
    (event.button !== 0 && event.button !== 1)
  )
    return;
  const anchor = event
    .composedPath()
    .find(
      (node) =>
        node instanceof HTMLAnchorElement || node instanceof HTMLAreaElement
    ) as HTMLAnchorElement | HTMLAreaElement | undefined;
  if (
    !anchor ||
    anchor.hasAttribute("download") ||
    anchor.relList.contains("opener")
  )
    return;
  const external =
    /^[a-z][a-z\d+.-]*:/i.test(anchor.href) &&
    !/^(?:https?|about|blob|data|javascript|vbscript):/i.test(anchor.href);
  const modified = event.ctrlKey || event.metaKey || event.button === 1;
  if (!external && !modified && anchor.target.toLowerCase() !== "_blank")
    return;
  if (event.type === "click" && event.button !== 0) return;
  if (event.type === "auxclick" && event.button !== 1) return;
  if (anchor.href.length > 8192 || location.href.length > 8192) return;
  if (external) event.preventDefault();
  ipcRenderer.sendSync("grida:browser-guest:link", {
    url: anchor.href,
    documentUrl: location.href,
    disposition: modified && !event.shiftKey ? "background" : "foreground",
  });
}
window.addEventListener("click", link);
window.addEventListener("auxclick", link);

// Report the document's eligible icons, including removals Chromium may omit.
if (window.top === window) {
  let token: string;
  let last = "";
  let queued = false;
  let head: HTMLHeadElement | null = null;
  const queries = new Map<string, MediaQueryList>();
  const observer = new MutationObserver(schedule);

  function schedule(): void {
    if (queued) return;
    queued = true;
    queueMicrotask(publish);
  }

  function publish(): void {
    queued = false;
    if (head !== document.head) {
      head = document.head;
      observer.disconnect();
      observer.observe(document.documentElement, { childList: true });
      if (head)
        observer.observe(head, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["href", "rel", "type", "sizes", "media"],
        });
    }
    const active = new Set<string>();
    const candidates = [];
    const links = document.head?.querySelectorAll<HTMLLinkElement>(
      'link[rel~="icon" i][href]'
    );
    // Inspect the last bounded set, preserving the HTML order for ties.
    for (
      let i = Math.max(0, (links?.length ?? 0) - 8);
      links && i < links.length;
      i++
    ) {
      const node = links[i];
      if (
        !node.getAttribute("href")?.trim() ||
        node.media.length > 256 ||
        node.type.length > 64
      )
        continue;
      if (node.media) {
        active.add(node.media);
        let query = queries.get(node.media);
        if (!query) {
          query = matchMedia(node.media);
          query.addEventListener("change", schedule);
          queries.set(node.media, query);
        }
        if (!query.matches) continue;
      }
      const url = node.href;
      if (!url || url.length > (url.startsWith("data:") ? 87_448 : 8192))
        continue;
      candidates.push({
        url,
        type: node.type,
        sizes: node.sizes.value.slice(0, 256),
      });
    }
    for (const [media, query] of queries) {
      if (active.has(media)) continue;
      query.removeEventListener("change", schedule);
      queries.delete(media);
    }
    const key = JSON.stringify(candidates);
    if (key === last) return;
    last = key;
    ipcRenderer.send("grida:browser-guest:favicons", token, candidates);
  }

  ipcRenderer.on(
    "grida:browser-guest:observe-favicons",
    (_event, next: string) => {
      if (next !== token) last = "";
      token = next;
      schedule();
    }
  );
}
