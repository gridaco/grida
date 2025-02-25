import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ImportDesignWithUrl } from "./import-design-with-url";
const _key = "import-design-with-url";
export const boring_extended_import_design_with_url = Node.create({
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
    return ReactNodeViewRenderer(ImportDesignWithUrl);
  },
});
