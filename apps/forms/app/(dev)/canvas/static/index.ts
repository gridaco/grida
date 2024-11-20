import { grida } from "@/grida";
import doc1 from "./1";
import doc2 from "./2";
import doc3 from "./3";
import doc4 from "./4";

export default {
  "1": {
    name: "Demo 1",
    document: doc1,
  },
  "2": {
    name: "Demo 1",
    document: doc2,
  },
  "3": {
    name: "1000 Rects",
    document: doc3,
  },
  "4": {
    name: "Fig 1",
    document: doc4,
  },
} satisfies Record<
  string,
  { name: string; document: grida.program.document.IDocumentDefinition }
>;
