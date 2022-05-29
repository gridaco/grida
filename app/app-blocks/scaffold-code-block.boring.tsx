import React from "react";
import { ScaffoldCodeBlock, ScaffoldCodeBlockProps } from "@app/blocks";
import { NodeViewWrapper } from "@boringso/react-core";

export function ScaffoldCodeBlock_Boring(props: any) {
  const p = props.node.attrs as ScaffoldCodeBlockProps;
  console.log("p", p);
  return (
    <NodeViewWrapper>
      <ScaffoldCodeBlock {...p} />
    </NodeViewWrapper>
  );
}
