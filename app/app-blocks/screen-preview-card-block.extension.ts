import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ScreenPreviewCardBlock_Boring } from "./screen-preview-card-block.boring";

const _key = "screen-preview-card-block";
export const boring_extended_screen_preview_card_block = Node.create({
  name: _key,

  group: "block",

  atom: true,

  addAttributes() {
    return {
      count: {
        default: 0,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: _key,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [_key, mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ScreenPreviewCardBlock_Boring);
  },
});
