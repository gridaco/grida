import React from "react";
import {
  ScreenPreviewCardBlock,
  ScreenPreviewCardBlockProps,
} from "@app/blocks";
import { NodeViewWrapper } from "@boringso/react-core";

export function ScreenPreviewCardBlock_Boring(
  props: ScreenPreviewCardBlockProps
) {
  return (
    <NodeViewWrapper>
      <ScreenPreviewCardBlock url="https://www.figma.com/file/Y0Gh77AqBoHH7dG1GtK3xF/grida?node-id=264%3A49" />
    </NodeViewWrapper>
  );
}
