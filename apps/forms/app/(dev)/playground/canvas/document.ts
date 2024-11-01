import { grida } from "@/grida";

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  root_id: "playground",
  nodes: {
    playground: {
      id: "playground",
      name: "playground",
      type: "container",
      active: true,
      locked: false,
      expanded: true,
      style: {},
      children: ["sticker"],
    },
    sticker: {
      id: "sticker",
      name: "sticker",
      type: "container",
      active: true,
      locked: false,
      expanded: true,
      style: {},
      children: [],
    },
  },
} satisfies grida.program.document.IDocumentDefinition;
