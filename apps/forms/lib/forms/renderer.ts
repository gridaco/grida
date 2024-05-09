import type {
  JSONField,
  FormBlockType,
  FormFieldDataSchema,
  FormFieldType,
  FormFieldDefinition,
  FormBlock,
  Option,
} from "@/types";
import { blockstree } from "./tree";
import { FormBlockTree } from "./types";

export type ClientRenderBlock =
  | ClientFieldRenderBlock
  | ClientSectionRenderBlock
  | ClientHtmlRenderBlock
  | ClientImageRenderBlock
  | ClientVideoRenderBlock
  | ClientDividerRenderBlock
  | ClientHeaderRenderBlock
  | ClientPdfRenderBlock;

export interface BaseRenderBlock {
  id: string;
  type: FormBlockType;
  local_index: number;
  parent_id: string | null;
}

export interface ClientFieldRenderBlock extends BaseRenderBlock {
  type: "field";
  field: {
    id: string;
    type: FormFieldType;
    name: string;
    label?: string;
    help_text?: string;
    min?: number;
    max?: number;
    pattern?: string;
    required?: boolean;
    minlength?: number;
    maxlength?: number;
    placeholder?: string;
    options?: {
      id: string;
      label?: string;
      value: string;
      disabled?: boolean;
      index: number;
    }[];
    autocomplete?: string;
    data?: FormFieldDataSchema | null;
    accept?: string;
    multiple?: boolean;
  };
}

export interface ClientSectionRenderBlock extends BaseRenderBlock {
  type: "section";
  children?: ClientRenderBlock[];
  attributes?: {
    contains_payment: boolean;
  };
}

export interface ClientHtmlRenderBlock extends BaseRenderBlock {
  type: "html";
  html: string;
}

export interface ClientImageRenderBlock extends BaseRenderBlock {
  type: "image";
  src: string;
}

export interface ClientVideoRenderBlock extends BaseRenderBlock {
  type: "video";
  src: string;
}

export interface ClientPdfRenderBlock extends BaseRenderBlock {
  type: "pdf";
  data: string;
}

export interface ClientDividerRenderBlock extends BaseRenderBlock {
  type: "divider";
}

export interface ClientHeaderRenderBlock extends BaseRenderBlock {
  type: "header";
  title_html?: string | null;
  description_html?: string | null;
}

export class FormRenderer {
  private readonly _m_render_blocks: ClientRenderBlock[];
  private readonly _m_render_fields: FormFieldDefinition[];
  private readonly _m_tree: FormBlockTree<ClientRenderBlock[]>;

  constructor(
    readonly id: string,
    private readonly _m_fields: FormFieldDefinition[],
    private readonly _m_blocks?: FormBlock[],
    plugins?: {
      option_renderer: (option: Option) => Option;
    }
  ) {
    this._m_render_blocks = _m_blocks
      ?.map((block: FormBlock) => {
        const is_field = block.type === "field";
        const field = is_field
          ? _m_fields.find((f: any) => f.id === block.form_field_id) ?? null
          : null;

        if (is_field) {
          // assert fiel to be not null
          if (!field) {
            return null; // this will be filtered out
          }

          return <ClientFieldRenderBlock>{
            id: block.id,
            type: "field",
            field: {
              ...field,
              options: field.options
                ?.sort((a, b) => (a?.index || 0) - (b?.index || 0))
                .map(
                  plugins?.option_renderer
                    ? plugins.option_renderer
                    : (option) => option
                ),
              required: field.required ?? undefined,
              multiple: field.multiple ?? undefined,
              autocomplete: field.autocomplete?.join(" ") ?? null,
            },
            local_index: block.local_index,
            parent_id: block.parent_id,
          };
        }

        switch (block.type) {
          case "html": {
            return <ClientHtmlRenderBlock>{
              id: block.id,
              type: "html",
              html: block.body_html,
              local_index: block.local_index,
              parent_id: block.parent_id,
            };
          }
          case "header": {
            return <ClientHeaderRenderBlock>{
              id: block.id,
              type: "header",
              local_index: block.local_index,
              parent_id: block.parent_id,
              title_html: block.title_html,
              description_html: block.description_html,
            };
          }
          case "image":
          case "video": {
            return <ClientImageRenderBlock>{
              id: block.id,
              type: block.type,
              src: block.src,
              local_index: block.local_index,
              parent_id: block.parent_id,
            };
          }
          case "pdf": {
            return <ClientPdfRenderBlock>{
              id: block.id,
              type: "pdf",
              // for pdf, as the standard is <object> we use data instead of src
              data: block.src,
              local_index: block.local_index,
              parent_id: block.parent_id,
            };
          }
          case "section": {
            const children_ids = _m_blocks.filter(
              (b) => b.parent_id === block.id
            );

            const contains_payment = children_ids.some(
              (b) =>
                b.type === "field" &&
                _m_fields.find((f) => f.id === b.form_field_id)?.type ===
                  "payment"
            );

            return <ClientSectionRenderBlock>{
              id: block.id,
              type: "section",
              local_index: block.local_index,
              attributes: {
                contains_payment,
              },
            };
          }
          case "divider":
          default: {
            return <BaseRenderBlock>{
              id: block.id,
              type: block.type,
              local_index: block.local_index,
              parent_id: block.parent_id,
            };
          }
        }
      })
      .filter(Boolean) as ClientRenderBlock[];

    const _field_blocks: ClientFieldRenderBlock[] =
      this._m_render_blocks.filter(
        (b) => b.type === "field"
      ) as ClientFieldRenderBlock[];

    const _render_field_ids = _field_blocks.map(
      (b: ClientFieldRenderBlock) => b.field.id
    );

    this._m_render_fields = _m_fields.filter((f) =>
      _render_field_ids.includes(f.id)
    );

    // if no blocks, render a simple form based on fields
    if (!this._m_render_blocks?.length) {
      this._m_render_blocks = _m_fields.map((field: any, i) => {
        return {
          id: field.id,
          type: "field",
          field: {
            ...field,
            options: field.options
              ?.sort((a: any, b: any) => (a?.index || 0) - (b?.index || 0))
              .map(
                plugins?.option_renderer
                  ? plugins.option_renderer
                  : (option: Option) => option
              ),
            required: field.required ?? undefined,
            multiple: field.multiple ?? undefined,
            autocomplete: field.autocomplete?.join(" ") ?? null,
          },
          local_index: i,
          parent_id: null,
        };
      });

      this._m_render_fields = this._m_fields;
    }

    this._m_tree = blockstree(this._m_render_blocks);
  }

  public tree() {
    return this._m_tree;
  }

  public blocks() {
    return this._m_render_blocks;
  }

  public fields(q?: { render: boolean }) {
    if (q?.render) {
      return this._m_render_fields;
    }
    return this._m_fields;
  }

  public validate() {
    throw new Error("Not implemented");
  }
}
