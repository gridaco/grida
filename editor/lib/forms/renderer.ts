import type {
  FormBlock,
  FormBlockType,
  FormFieldDataSchema,
  FormInputType,
  FormFieldDefinition,
  Option,
  FormsPageLanguage,
} from "@/grida-forms/hosted/types";
import { blockstree } from "./tree";
import { FormBlockTree } from "./types";
import { toArrayOf } from "@/types/utility";
import { FieldSupports } from "@/k/supported_field_types";
import type { tokens } from "@grida/tokens";

export type ClientRenderBlock =
  | ClientFieldRenderBlock
  | ClientFileUploadFieldRenderBlock
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
  v_hidden?: FormBlock["v_hidden"] | null;
}

type ClientRenderOption = {
  id: string;
  value: string;
  label?: string;
  disabled?: boolean | null;
  index?: number;
};

type ClientRenderOptgroup = {
  id: string;
  label?: string;
  disabled?: boolean | null;
  index?: number;
};

export interface ClientFieldRenderBlock<T extends FormInputType = FormInputType>
  extends BaseRenderBlock {
  type: "field";
  field: {
    id: string;
    type: T;
    is_array?: boolean;
    name: string;
    label?: string;
    help_text?: string;
    step?: number;
    min?: number;
    max?: number;
    pattern?: string;
    required?: boolean;
    readonly?: boolean;
    minlength?: number;
    maxlength?: number;
    placeholder?: string;
    options?: ClientRenderOption[];
    optgroups?: ClientRenderOptgroup[];
    autocomplete?: string;
    data?: FormFieldDataSchema | null;
    accept?: string;
    multiple?: boolean;
    v_value?: tokens.TValueExpression;
  };
}

export type FileUploadStrategyMultipart = { type: "multipart" };
export type FileUploadStrategySignedUrl = {
  type: "signedurl";
  signed_urls: Array<{
    path: string;
    token: string;
  }>;
};
export type FileUploadStrategyRequesUploadtUrl = {
  type: "requesturl";
  request_url: string;
};

export type FileUploadStrategy =
  | FileUploadStrategyMultipart
  | FileUploadStrategySignedUrl
  | FileUploadStrategyRequesUploadtUrl;

export type FileResolveStrategyRequestUrl = {
  type: "requesturl";
  resolve_url: string;
};

export type FileResolveStrategy =
  | FileResolveStrategyRequestUrl
  | {
      type: "none";
    };

export interface ClientFileUploadFieldRenderBlock
  extends ClientFieldRenderBlock<
    "file" | "image" | "audio" | "video" | "richtext"
  > {
  field: ClientFieldRenderBlock<
    "file" | "image" | "audio" | "video" | "richtext"
  >["field"] & {
    accept?: string;
    multiple?: boolean;
  } & {
    upload: FileUploadStrategy;
    resolve?: FileResolveStrategy;
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

interface RenderTreeConfig {
  blocks: {
    when_empty?: {
      /**
       * header block configuration when there are no blocks provided
       */
      header?: {
        /**
         * create a header block on top with title and description
         */
        title_and_description: {
          enabled: boolean;
        };
      };
    };
  };
}

export class FormRenderTree {
  private readonly _m_render_blocks: ClientRenderBlock[];
  private readonly _m_render_fields: FormFieldDefinition[];
  private readonly _m_options: Option[];
  private readonly _m_options_by_field: Record<string, Option[]>;
  private readonly _m_tree: FormBlockTree<ClientRenderBlock[]>;

  constructor(
    readonly id: string,
    readonly title: string | null | undefined,
    readonly description: string | null | undefined,
    readonly lang: FormsPageLanguage | null | undefined,
    private readonly _m_fields: FormFieldDefinition[] = [],
    private readonly _m_blocks?: FormBlock[] | null,
    private readonly config?: RenderTreeConfig,
    private readonly plugins?: {
      option_renderer: (option: Option) => Option;
      file_uploader?: (field_id: string) => FileUploadStrategy;
      file_resolver?: (field_id: string) => FileResolveStrategy;
    }
  ) {
    this._m_render_blocks =
      (_m_blocks
        ?.map((block: FormBlock) => {
          const is_field = block.type === "field";
          const field = is_field
            ? (_m_fields.find((f: any) => f.id === block.form_field_id) ?? null)
            : null;

          const shared: Partial<BaseRenderBlock> = {
            id: block.id,
            local_index: block.local_index,
            parent_id: block.parent_id,
            v_hidden: block.v_hidden,
          } as const;

          if (is_field) {
            // assert fiel to be not null
            if (!field) {
              return null; // this will be filtered out
            }

            return <ClientFieldRenderBlock | ClientFileUploadFieldRenderBlock>{
              ...shared,
              type: "field",
              field: this._field_block_field_definition(field),
            };
          }

          switch (block.type) {
            case "html": {
              return <ClientHtmlRenderBlock>{
                ...shared,
                type: "html",
                html: block.body_html,
              };
            }
            case "header": {
              return <ClientHeaderRenderBlock>{
                ...shared,
                type: "header",
                title_html: block.title_html,
                description_html: block.description_html,
              };
            }
            case "image":
            case "video": {
              return <ClientImageRenderBlock>{
                ...shared,
                type: block.type,
                src: block.src,
              };
            }
            case "pdf": {
              return <ClientPdfRenderBlock>{
                ...shared,
                type: "pdf",
                // for pdf, as the standard is <object> we use data instead of src
                data: block.src,
              };
            }
            case "section": {
              const children_ids = _m_blocks?.filter(
                (b) => b.parent_id === block.id
              );

              const contains_payment = children_ids.some(
                (b) =>
                  b.type === "field" &&
                  _m_fields.find((f) => f.id === b.form_field_id)?.type ===
                    "payment"
              );

              return <ClientSectionRenderBlock>{
                ...shared,
                type: "section",
                attributes: {
                  contains_payment,
                },
              };
            }
            case "divider":
            default: {
              return <BaseRenderBlock>{
                ...shared,
                type: block.type,
              };
            }
          }
        })
        ?.filter(Boolean) as ClientRenderBlock[]) ?? [];

    const _field_blocks: ClientFieldRenderBlock[] =
      this._m_render_blocks.filter(
        (b) => b.type === "field"
      ) as ClientFieldRenderBlock[];

    this._m_options = this._m_fields
      .map((f) => f.options)
      .filter(Boolean)
      .flat() as Option[];

    this._m_options_by_field = _field_blocks.reduce(
      (acc, b) => {
        acc[b.field.id] = b.field.options as Option[];
        return acc;
      },
      {} as Record<string, Option[]>
    );

    const _render_field_ids = _field_blocks.map(
      (b: ClientFieldRenderBlock) => b.field.id
    );

    this._m_render_fields = _m_fields.filter((f) =>
      _render_field_ids.includes(f.id)
    );

    // if no blocks, render a simple form based on fields
    const is_render_blocks_empty = !this._m_render_blocks?.length;
    if (is_render_blocks_empty) {
      type ClientRenderBlockWithoutIndex = Omit<
        ClientRenderBlock,
        "local_index"
      >;

      const blocks: ClientRenderBlockWithoutIndex[] = [];

      const _fields_as_blocks: ClientRenderBlockWithoutIndex[] = _m_fields.map(
        (field: any, i) => {
          return <ClientRenderBlockWithoutIndex>{
            id: field.id,
            type: "field",
            field: this._field_block_field_definition(field),
            parent_id: null,
          };
        }
      );

      if (config?.blocks.when_empty) {
        if (config.blocks.when_empty.header?.title_and_description?.enabled) {
          blocks.push(<ClientRenderBlockWithoutIndex>{
            id: "header",
            type: "header",
            parent_id: null,
            title_html: title,
            description_html: description,
          });
        }
      }

      blocks.push(..._fields_as_blocks);

      this._m_render_blocks = blocks.map((b, i) => ({
        ...b,
        local_index: i,
      })) as ClientRenderBlock[];
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

  public options(q?: { of: string }) {
    if (q?.of) {
      return this._m_options_by_field[q.of];
    }
    return this._m_options;
  }

  public validate() {
    throw new Error("Not implemented");
  }

  private _field_block_field_definition(
    field: FormFieldDefinition
  ): (ClientFieldRenderBlock | ClientFileUploadFieldRenderBlock)["field"] {
    const mkoption = (options?: Option[]) =>
      options
        ?.sort((a, b) => (a?.index || 0) - (b?.index || 0))
        .map((o, i) => ({ ...o, index: i }))
        .map(
          this.plugins?.option_renderer
            ? this.plugins.option_renderer
            : (option) => option
        );

    const mkfileupload = (): FileUploadStrategy | undefined => {
      if (FieldSupports.file_upload(field.type)) {
        if (this.plugins?.file_uploader) {
          return this.plugins.file_uploader(field.id);
        } else {
          return { type: "multipart" };
        }
        //
      } else {
        return undefined;
      }
    };

    const mkfileresolve = (): FileResolveStrategy | undefined => {
      if (FieldSupports.file_upload(field.type)) {
        if (this.plugins?.file_resolver) {
          return this.plugins.file_resolver(field.id);
        } else {
          return { type: "none" };
        }
        //
      } else {
        return undefined;
      }
    };

    const base: ClientFieldRenderBlock["field"] = {
      ...field,
      options: mkoption(field.options),
      optgroups: field.optgroups,
      label: field.label || undefined,
      help_text: field.help_text || undefined,
      placeholder: field.placeholder || undefined,
      accept: field.accept || undefined,
      required: field.required ?? undefined,
      readonly: field.readonly ?? undefined,
      multiple: field.multiple ?? undefined,
      autocomplete: toArrayOf(field.autocomplete)?.join(" ") ?? undefined,
      step: field.step ?? undefined,
      min: field.min ?? undefined,
      max: field.max ?? undefined,
      v_value: (field.v_value as tokens.TValueExpression) ?? undefined,
    };

    if (FieldSupports.file_upload(field.type)) {
      return {
        ...base,
        upload: mkfileupload(),
        resolve: mkfileresolve(),
      } as ClientFileUploadFieldRenderBlock["field"];
    } else {
      return base as ClientFieldRenderBlock["field"];
    }
  }
}
