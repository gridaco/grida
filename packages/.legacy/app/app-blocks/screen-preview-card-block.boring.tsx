import React from "react";
import {
  ScreenPreviewCardBlock,
  ScreenPreviewCardBlockProps,
} from "@app/blocks";
import { NodeViewWrapper } from "@boringso/react-core";

export function ScreenPreviewCardBlock_Boring(props: any) {
  const p = props.node.attrs as ScreenPreviewCardBlockProps;
  return (
    <NodeViewWrapper>
      <ScreenPreviewCardBlock {...p} />
    </NodeViewWrapper>
  );
}
