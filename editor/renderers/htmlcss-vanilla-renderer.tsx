import { CraftHtmlElement } from "@code-editor/craft/core";

export function HtmlCssVanillaRenderer({
  target,
}: {
  target: CraftHtmlElement;
}) {
  return <div id={target.id} style={target.style}></div>;
}
