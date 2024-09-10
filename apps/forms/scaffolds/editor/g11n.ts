import type { IFormBlock, IFormField } from "@/types";

type G11nFormBlockResourceQuery = [
  type: "block",
  {
    id: string;
    property:
      | keyof Pick<
          IFormBlock,
          "title_html" | "description_html" | "body_html" | "src"
        >
      | keyof Pick<IFormField, "label" | "placeholder" | "help_text">;
  },
];

type ResourceKeyQuery = G11nFormBlockResourceQuery;

export function g11nkey(...q: ResourceKeyQuery) {
  const [type, { id, property }] = q;
  return [type, id, property].join(".");
}
