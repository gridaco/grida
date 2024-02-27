import { CraftHtmlElement } from "@code-editor/craft/core";

export function HtmlCssVanillaRenderer({
  target,
}: {
  target: CraftHtmlElement;
}) {
  const Tag = target.tag;
  return (
    <Tag
      id={target.id}
      tw={target.attributes.tw}
      style={target.style}
      src={target.attributes.src}
    >
      {target.text}
    </Tag>
  );
}
