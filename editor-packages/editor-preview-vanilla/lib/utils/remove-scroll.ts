/**
 * this is a explicit temporary solution to disable iframe content to be scrolling. we aleardy disable scrolling a root element inside the body, but when the element is big and the scale factor is not persice enough, the scrollbar will be shown.
 * @ask: @softmarshmallow
 * @param iframe
 */
export function __dangerously_disable_scroll_in_html_body(
  iframe: HTMLIFrameElement
) {
  try {
    iframe.contentDocument.getElementsByTagName("body")[0].style.overflow =
      "hidden";
  } catch (_) {
    if (process.env.NODE_ENV === "development") {
      console.error("__dangerously_disable_scroll_in_html_body", _);
    }
  }
}
