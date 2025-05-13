import React from "react";
import { ReflectTextNode } from "@design-sdk/figma-node";

export function TextNode(text: ReflectTextNode) {
  return <span>{text.data}</span>;
}
