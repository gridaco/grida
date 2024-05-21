import type { ClientRenderBlock } from "@/lib/forms";
import type { FormFieldDefinition } from "@/types";

export interface FormAgentState {
  fields: {
    [key: string]: {
      value?: string;
    };
  };
  blocks: {
    [key: string]: {
      hidden?: boolean;
    };
  };
  current_section_id?: string;
}

export function init({
  fields,
  blocks,
}: {
  fields: FormFieldDefinition[];
  blocks: ClientRenderBlock[];
}): FormAgentState {
  // TODO: populate with fields
  const fields_state = fields.reduce(
    (acc, field) => {
      const { id } = field;

      acc[id] = {
        value: undefined,
      };

      return acc;
    },
    {} as FormAgentState["fields"]
  );

  const blocks_state = blocks.reduce(
    (acc, block) => {
      const { id } = block;

      acc[id] = {
        // TODO: initially compute
        hidden: false,
      };

      return acc;
    },
    {} as FormAgentState["blocks"]
  );

  return {
    fields: fields_state,
    blocks: blocks_state,
    // TODO:
    current_section_id: undefined,
  };
}
