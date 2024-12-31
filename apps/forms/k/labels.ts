import { GDocumentType } from "@/types";

export namespace Labels {
  const doctype_labels = {
    v0_schema: "Database",
    v0_form: "Form",
    v0_site: "Site",
    v0_canvas: "Canvas",
  } as const;

  export function doctype(dt: GDocumentType) {
    return doctype_labels[dt];
  }
}
