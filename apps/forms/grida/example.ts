import { grida } from "./index";

const userprops = {
  title: { type: "string" },
  subtitle: { type: "string" },
  background: { type: "image" },
} satisfies grida.program.document.template.TemplateDocumentDefinition["properties"];
