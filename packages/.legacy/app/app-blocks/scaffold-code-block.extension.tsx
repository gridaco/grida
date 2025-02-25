import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ScaffoldCodeBlock_Boring } from "./scaffold-code-block.boring";

const _key = "scaffold-code-block";
export const boring_extended_screen_scaffold_code_block = Node.create({
  name: _key,

  group: "block",

  atom: true,

  addAttributes() {
    return {
      source: {
        default: undefined,
      },
      lang: {
        default: undefined,
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
    return ReactNodeViewRenderer(ScaffoldCodeBlock_Boring);
  },
});
