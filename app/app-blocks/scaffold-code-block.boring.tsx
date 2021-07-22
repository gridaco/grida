import React from "react";
import { ScaffoldCodeBlock, ScaffoldCodeBlockProps } from "@app/blocks";
import { NodeViewWrapper } from "@boringso/react-core";

export function ScaffoldCodeBlock_Boring(props) {
  const p = props.node.attrs as ScaffoldCodeBlockProps;
  return (
    <NodeViewWrapper>
      <ScaffoldCodeBlock {...p} />
    </NodeViewWrapper>
  );
}
