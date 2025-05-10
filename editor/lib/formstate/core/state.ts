import { FormBlockTree } from "@/lib/forms/types";
import type { ClientRenderBlock, ClientSectionRenderBlock } from "@/lib/forms";
import type { FormFieldDefinition } from "@/types";
import type { FormAgentGeo } from "./geo";

export type VirtualFileValueProxy = {
  // standard
  name: string;
  type: string;
  size: number;
  lastModified: number;
  // proxied
  duration?: number;
};

export interface FormAgentState {
  form_id: string;
  session_id?: string;
  tree: FormBlockTree<ClientRenderBlock[]>;
  geo: FormAgentGeo | undefined;
  // do not change the keys
  // #/fields/[key]/value
  fields: {
    [key: string]: {
      value: string | number | boolean | string[] | undefined | null;
      files?: VirtualFileValueProxy[];
      // consider moving this to a proxy method
      file?: VirtualFileValueProxy;
    };
  };
  // used for browser dom manipulation
  rawfiles: { [key: string]: File[] };
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
  //
  defaultValues?: Record<string, any>;
}

export function initdummy(): FormAgentState {
  return {
    form_id: "",
    geo: undefined,
    fields: {},
    blocks: {},
    rawfiles: {},
    sections: [],
    has_sections: false,
    last_section_id: null,
    current_section_id: null,
    is_submitting: false,
    tree: { children: [], depth: 0 },
  };
}

export function init({
  form_id,
  session_id,
  geo,
  fields,
  blocks,
  tree,
  defaultValues,
}: {
  form_id: string;
  session_id?: string;
  geo?: FormAgentGeo | undefined | null;
  fields: FormFieldDefinition[];
  blocks: ClientRenderBlock[];
  tree: FormBlockTree<ClientRenderBlock[]>;
  defaultValues?: Record<string, any>;
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
    geo: geo ?? undefined,
    tree,
    rawfiles: {},
    fields: fields_state,
    blocks: blocks_state,
    sections,
    has_sections,
    last_section_id,
    current_section_id: initial_section_id,
    is_submitting: false,
    defaultValues,
  };
}
