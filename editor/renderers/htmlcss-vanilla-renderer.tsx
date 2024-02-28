import { CraftHtmlElement } from "@code-editor/craft/core";
import * as css from "@web-builder/styles";

export function HtmlCssVanillaRenderer({
  target,
}: {
  target: CraftHtmlElement;
}) {
  const Tag = target.tag;

  const boxShadow = target.style.boxShadow
    ? css.boxshadow(target.style.boxShadow)
    : undefined;

  return (
    <Tag
      id={target.id}
      tw={target.attributes.tw}
      style={{ ...target.style, boxShadow }}
      src={target.attributes.src}
    >
      {target.text}
    </Tag>
  );
}
