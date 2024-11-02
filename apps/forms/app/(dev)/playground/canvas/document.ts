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
      opacity: 1,
      zIndex: 0,
      style: {
        // width: 375,
        // height: 812,
        backgroundColor: "#f5f5f5",
        boxShadow: "0 0 10px rgba(0,0,0,0.1)",
      },
      children: ["sticker"],
    },
    sticker: {
      id: "sticker",
      name: "sticker",
      type: "container",
      active: true,
      locked: false,
      expanded: true,
      opacity: 1,
      zIndex: 0,
      style: {
        // position: "absolute",
        // top: 100,
        // left: 100,
        // width: 100,
        // height: 100,
        backgroundColor: "#000",
      },
      children: [],
    },
  },
} satisfies grida.program.document.IDocumentDefinition;
