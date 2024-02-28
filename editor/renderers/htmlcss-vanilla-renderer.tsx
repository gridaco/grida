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

  const boxShadow = target.style?.boxShadow
    ? css.boxshadow(target.style.boxShadow)
    : undefined;

  if (target.tag === "img") {
    return (
      // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
      <img
        id={target.id}
        // tw={target.attributes?.tw}
        style={{
          ...target.style,
          boxShadow,
        }}
        src={target.attributes?.src}
      />
    );
  }

  return (
    <Tag
      id={target.id}
      // tw={target.attributes?.tw}
      style={{
        ...target.style,
        boxShadow,
      }}
      src={target.attributes?.src}
    >
      {target.text}
      {target.children?.map((target) => renderer({ target }))}
    </Tag>
  );
}
