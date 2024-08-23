import { editorbasepath } from "@/lib/forms/url";
import type {
  BaseDocumentEditorInit,
  BaseDocumentEditorState,
  SchemaDocumentEditorInit,
  EditorInit,
  FormDocumentEditorInit,
  EditorState,
  MenuItem,
  SiteDocumentEditorInit,
  IDataGridState,
  GDocTableID,
  GDocTable,
  TVirtualRow,
  TGlobalDataStreamState,
  SchemaDocumentTableInit,
} from "./state";
import { blockstreeflat } from "@/lib/forms/tree";
import { SYM_LOCALTZ, EditorSymbols } from "./symbols";
import { GridaSupabase } from "@/types";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";

export function initialEditorState(init: EditorInit): EditorState {
  switch (init.doctype) {
    case "v0_form":
      return initialFormEditorState(init);
    case "v0_site":
      return initialSiteEditorState(init);
    case "v0_schema":
      return initialDatabaseEditorState(init);
    default:
      throw new Error("unsupported doctype");
  }
}

const initial_sidebar_mode = {
  v0_form: "build",
  v0_site: "build",
  v0_schema: "data",
} as const;

function initialBaseDocumentEditorState(
  init: BaseDocumentEditorInit
): Omit<BaseDocumentEditorState, "document"> {
  const basepath = editorbasepath({
    org: init.organization.name,
    proj: init.project.name,
  });

  return {
    basepath: basepath,
    doctype: init.doctype,
    document_id: init.document_id,
    document_title: init.document_title,
    organization: init.organization,
    project: init.project,
    saving: false,
    theme: init.theme,
    assets: {
      backgrounds: [],
    },
    row_editor: {
      open: false,
    },
    customer_editor: {
      open: false,
    },
    insertmenu: {
      open: false,
    },
    field_editor: {
      open: false,
    },
    dateformat: "datetime",
    datetz: SYM_LOCALTZ,
  };
}

export function initialDatagridState(): Omit<
  IDataGridState,
  "datagrid_table_id"
> {
  return {
    datagrid_selected_rows: new Set(),
    datagrid_rows_per_page: 100,
    datagrid_table_refresh_key: 0,
    datagrid_isloading: false,
    datagrid_filter: {
      masking_enabled: false,
      empty_data_hidden: true,
    },
    datagrid_orderby: {},
  };
}

export function table_to_sidebar_table_menu(
  tb: SchemaDocumentTableInit,
  {
    basepath,
    document_id,
  }: {
    basepath: string;
    document_id: string;
  }
): MenuItem<GDocTableID> {
  return {
    section: "Tables",
    id: tb.id,
    label: tb.name,
    icon: "table",
    href: tablehref(basepath, document_id, tb),
  };
}

/**
 * // FIXME: not ready
 * @deprecated @beta
 * @param init
 * @returns
 */
function initialDatabaseEditorState(
  init: SchemaDocumentEditorInit
): EditorState {
  const base = initialBaseDocumentEditorState(init);
  // @ts-ignore
  return {
    ...base,
    connections: {},
    document: {
      pages: [],
      nodes: [],
      templatedata: {},
    },
    sidebar: {
      mode: initial_sidebar_mode[init.doctype],
      mode_data: {
        tables: init.tables.map((t) =>
          table_to_sidebar_table_menu(t, {
            basepath: base.basepath,
            document_id: base.document_id,
          })
        ),
        menus: [],
      },
    },
    ...initialDatagridState(),
    datagrid_table_id: init.tables.length > 0 ? init.tables[0].id : null,
    tables: init.tables.map((t) => ({
      id: t.id,
      row_keyword: "row",
      label: t.name,
      name: t.name,
      description: t.description,
      icon: "table",
      readonly: false,
      attributes: t.attributes,
    })),

    // @ts-expect-error
    tablespace: init.tables.reduce(
      (acc: Record<GDocTableID, TGlobalDataStreamState<TVirtualRow>>, t) => {
        acc[t.id] = {
          readonly: false,
          realtime: true,
          stream: [],
        } satisfies TGlobalDataStreamState<TVirtualRow>;
        return acc;
      },
      {}
    ),
  };
}

/**
 * // FIXME: not ready
 * @deprecated @beta
 * @param init
 * @returns
 */
function initialSiteEditorState(init: SiteDocumentEditorInit): EditorState {
  const base = initialBaseDocumentEditorState(init);
  // @ts-ignore
  return {
    ...base,
    document: {
      pages: sitedocumentpagesinit({
        basepath: base.basepath,
        document_id: init.document_id,
      }),
      selected_page_id: "collection",
      nodes: [],
      templatesample: "formcollection_sample_001_the_bundle",
      templatedata: {},
    },
    tables: [],
  };
}

function initialFormEditorState(init: FormDocumentEditorInit): EditorState {
  // prepare initial available_field_ids
  const field_ids = init.fields.map((f) => f.id);
  const block_referenced_field_ids = init.blocks
    .map((b) => b.form_field_id)
    .filter((id) => id !== null) as string[];
  const block_available_field_ids = field_ids.filter(
    (id) => !block_referenced_field_ids.includes(id)
  );

  const is_main_table_supabase =
    !!init.connections?.supabase?.main_supabase_table;

  const base = initialBaseDocumentEditorState(init);

  const { basepath, document_id } = base;

  const tables = init.connections?.supabase?.main_supabase_table
    ? {
        [EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID]: {
          id: EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID,
          row_keyword: "row",
          icon: "supabase",
          name: init.connections.supabase.main_supabase_table.sb_table_name,
          label: init.connections.supabase.main_supabase_table.sb_table_name,
          description: null,
          readonly: false,
        } satisfies GDocTable,
        [EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID]: {
          id: EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID,
          row_keyword: "user",
          icon: "supabase",
          name: "auth.users",
          label: "auth.users",
          description: null,
          readonly: true,
        } satisfies GDocTable,
      }
    : {
        [EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID]: {
          id: EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID,
          row_keyword: "response",
          icon: "table",
          name: "response",
          label: "Responses",
          description: null,
          readonly: false,
        } satisfies GDocTable,
        [EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID]: {
          id: EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID,
          row_keyword: "session",
          icon: "table",
          name: "session",
          label: "Sessions",
          description: null,
          readonly: true,
        } satisfies GDocTable,
        [EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID]: {
          id: EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID,
          row_keyword: "customer",
          icon: "user",
          name: "customer",
          label: "Customers",
          description: null,
          readonly: true,
        } satisfies GDocTable,
      };

  const tablemenus = init.connections?.supabase?.main_supabase_table
    ? [
        {
          id: EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID,
          href: tablehref(
            basepath,
            document_id,
            (tables as any)[
              EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
            ]
          ),
          label: "Responses",
          icon: "supabase",
          section: "Tables",
        } satisfies MenuItem<GDocTableID>,
        {
          id: EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID,
          href: tablehref(
            basepath,
            document_id,
            (tables as any)[
              EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID
            ]
          ),
          label: "auth.users",
          icon: "supabase",
          section: "Tables",
        } satisfies MenuItem<GDocTableID>,
      ]
    : [
        {
          id: EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID,
          href: tablehref(
            basepath,
            document_id,
            (tables as any)[
              EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
            ]
          ),
          label: "Responses",
          icon: "table",
          section: "Tables",
        } satisfies MenuItem<GDocTableID>,
        {
          id: EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID,
          href: tablehref(
            basepath,
            document_id,
            (tables as any)[EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID]
          ),
          label: "Customers",
          icon: "user",
          section: "Tables",
        } satisfies MenuItem<GDocTableID>,
      ];

  const tableids = Object.getOwnPropertySymbols(tables);
  const values = tableids.map((id) => (tables as any)[id]);

  return {
    ...base,
    connections: {
      store_id: init.connections?.store_id,
      supabase: init.connections?.supabase,
    },
    theme: init.theme,
    form_id: init.form_id,
    form_title: init.form_title,
    sidebar: {
      mode: initial_sidebar_mode[init.doctype],
      mode_data: {
        tables: tablemenus,
        menus: [
          {
            id: `/${basepath}/${document_id}/data/analytics`,
            section: "Analytics",
            href: `/${basepath}/${document_id}/data/analytics`,
            icon: "chart",
            label: "Realtime",
          },
        ],
      },
    },
    tables: values,
    campaign: init.campaign,

    blocks: blockstreeflat(init.blocks),
    document: {
      pages: formdocumentpagesinit({
        basepath: base.basepath,
        document_id: init.document_id,
      }),
      selected_page_id: "", // "form",
      nodes: [],
      templatedata: {},
    },
    form: {
      ending: init.ending,
      fields: init.fields,
      form_security: init.form_security,
      available_field_ids: block_available_field_ids,
    },
    tablespace: {
      [EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID]: {
        readonly: false,
        realtime: true,
        stream: [],
      },
      [EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID]: {
        readonly: true,
        stream: undefined,
        realtime: false,
      },
      [EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID]: {
        readonly: true,
        stream: undefined,
        realtime: false,
      },
      // noop
      [EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID]:
        "noop" as never,
      [EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID]:
        "noop" as never,
    },
    ...initialDatagridState(),
    datagrid_table_id: is_main_table_supabase
      ? EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
      : EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID,
    x_supabase_main_table: init.connections?.supabase
      ? xsbmtinit(init.connections.supabase)
      : undefined,
  };
}

function sitedocumentpagesinit({
  basepath,
  document_id,
}: {
  basepath: string;
  document_id: string;
}): MenuItem<string>[] {
  return [
    {
      section: "Pages",
      id: "collection",
      label: "home",
      href: `/${basepath}/${document_id}/design`,
      icon: "file",
    },
  ];
}

function formdocumentpagesinit({
  basepath,
  document_id,
}: {
  basepath: string;
  document_id: string;
}): MenuItem<string>[] {
  return [
    {
      section: "Design",
      id: "campaign",
      label: "Campaign",
      href: `/${basepath}/${document_id}/form`,
      icon: "folder",
    },
    // {
    //   section: "Form",
    //   id: "start",
    //   label: "Start Page",
    //   href: `/${basepath}/${form_id}/form/start`,
    //   icon: "file",
    //   level: 1,
    // },
    {
      section: "Design",
      id: "form",
      label: "Form Page",
      href: `/${basepath}/${document_id}/form/edit`,
      icon: "file",
      level: 1,
    },
    {
      section: "Design",
      id: "ending",
      label: "Ending Page",
      href: `/${basepath}/${document_id}/form/end`,
      icon: "file",
      level: 1,
    },
    {
      section: "Design",
      id: "responses",
      label: "Responses",
      href: `/${basepath}/${document_id}/data/responses`,
      icon: "table",
      level: 1,
    },
  ];
}

function xsbmtinit(conn?: GridaSupabase.SupabaseConnectionState) {
  // TODO: need inspection - will supbaseconn present even when main table is not present?
  // if yes, we need to adjust the state to be nullable
  if (!conn) return undefined;
  if (!conn.main_supabase_table) return undefined;

  const parsed = conn.main_supabase_table.sb_table_schema
    ? SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
        conn.main_supabase_table?.sb_table_schema
      )
    : undefined;

  return {
    schema: conn.main_supabase_table.sb_table_schema,
    pks: parsed?.pks || [],
    gfpk: (parsed?.pks?.length || 0) > 0 ? parsed?.pks[0] : undefined,
    rows: [],
  };
}

function tablehref(
  basepath: string,
  document_id: string,
  table: {
    id: GDocTableID;
    name: string;
  }
) {
  switch (table.id) {
    case EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID:
    case EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID:
      return `/${basepath}/${document_id}/data/responses`;
    // TODO: session
    case EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID:
      return `/${basepath}/${document_id}/data/responses?view=session`;
    case EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID:
      return `/${basepath}/${document_id}/data/customers`;
    case EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID:
      return `/${basepath}/${document_id}/data/x/auth.users`;
  }

  // v0_schema table
  return `/${basepath}/${document_id}/data/table/${table.name}`;
}