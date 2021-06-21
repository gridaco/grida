import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ImportDesignWithUrl } from "./import-design-with-url";

export const boring_extended_import_design_with_url = Node.create({
  name: "import-design-with-url",

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
        tag: "import-design-with-url",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["import-design-with-url", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImportDesignWithUrl);
  },
});
