import React from "react";
import { CraftElement, CraftHtmlElement } from "@code-editor/craft/core";
import * as css from "@web-builder/styles";

export function HtmlCssVanillaRenderer({
  target,
  renderer,
}: {
  target: CraftHtmlElement;
  renderer: (props: { target: CraftElement }) => React.ReactNode;
}) {
  const Tag = target.tag;

  const boxShadow = target.style.boxShadow
    ? css.boxshadow(target.style.boxShadow)
    : undefined;

  return (
    <Tag
      id={target.id}
      tw={target.attributes?.tw}
      style={{
        ...target.style,
        boxShadow,
      }}
      src={target.attributes?.src}
    >
      {target.text || target.children.map((target) => renderer({ target }))}
    </Tag>
  );
}
