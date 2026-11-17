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
