import type { ClientRenderBlock, ClientSectionRenderBlock } from "@/lib/forms";
import { FormBlockTree } from "@/lib/forms/types";
import type { FormFieldDefinition } from "@/types";

export interface FormAgentState {
  form_id: string;
  session_id?: string;
  // do not change the keys
  // #/fields/${string}/value
  fields: {
    [key: string]: {
      value?: string | number | boolean | string[] | undefined;
    };
  };
  blocks: {
    [key: string]: {
      hidden?: boolean;
    };
  };
  has_sections?: boolean;
  current_section_id: string | null;
  last_section_id: string | null;
  is_submitting: boolean;
  sections: ClientSectionRenderBlock[];
}

export function init({
  form_id,
  session_id,
  fields,
  blocks,
  tree,
}: {
  form_id: string;
  session_id?: string;
  fields: FormFieldDefinition[];
  blocks: ClientRenderBlock[];
  tree: FormBlockTree<ClientRenderBlock[]>;
}): FormAgentState {
  const sections = tree.children.filter(
    (block) => block.type === "section"
  ) as ClientSectionRenderBlock[];

  const has_sections = sections.length > 0;

  const last_section_id = has_sections
    ? sections[sections.length - 1].id
    : null;

  const initial_section_id = has_sections ? sections[0].id : null;

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
    form_id,
    session_id,
    fields: fields_state,
    blocks: blocks_state,
    sections,
    has_sections,
    last_section_id,
    current_section_id: initial_section_id,
    is_submitting: false,
  };
}
