import { grida } from "@/grida";
import doc1 from "./1";
import doc2 from "./2";
export default {
  "1": {
    name: "Demo 1",
    document: doc1,
  },
  "2": {
    name: "Demo 1",
    document: doc2,
  },
} satisfies Record<
  string,
  { name: string; document: grida.program.document.IDocumentDefinition }
>;
