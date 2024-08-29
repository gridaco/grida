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
  TTablespace,
  TableXSBMainTableConnection,
  GDocSchemaTable,
  TableMenuItem,
} from "./state";
import { blockstreeflat } from "@/lib/forms/tree";
import { SYM_LOCALTZ, EditorSymbols } from "./symbols";
import { FormFieldDefinition, GridaXSupabase } from "@/types";
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
  tb: {
    id: GDocTableID;
    name: string;
    x_sb_main_table_connection?: TableXSBMainTableConnection;
  },
  {
    basepath,
    document_id,
  }: {
    basepath: string;
    document_id: string;
  }
): TableMenuItem {
  return {
    section: "Tables",
    id: tb.id,
    label: tb.name,
    icon: tb.x_sb_main_table_connection ? "supabase" : "table",
    href: tablehref(basepath, document_id, tb),
    data: {
      readonly: tb.x_sb_main_table_connection
        ? SupabasePostgRESTOpenApi.table_methods_is_get_only(
            tb.x_sb_main_table_connection?.sb_postgrest_methods
          )
        : false,
    },
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

  const tables: GDocTable[] = [...init.tables.map(schematableinit)];

  const sb_auth_users = {
    provider: "x-supabase",
    id: EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID,
    row_keyword: "user",
    icon: "supabase",
    name: "auth.users",
    label: "auth.users",
    description: null,
    readonly: true,
  } satisfies GDocTable;

  const should_add_sb_auth_users =
    init.supabase_project && tables.some((t) => t.provider === "x-supabase");

  // @ts-ignore
  return {
    ...base,
    supabase_project: init.supabase_project,
    connections: {},
    document: {
      pages: [],
      nodes: [],
      templatedata: {},
    },
    sidebar: {
      mode: initial_sidebar_mode[init.doctype],
      mode_data: {
        tables: init.tables
          .map((t) =>
            table_to_sidebar_table_menu(t, {
              basepath: base.basepath,
              document_id: base.document_id,
            })
          )
          .concat(
            should_add_sb_auth_users
              ? [
                  {
                    id: EditorSymbols.Table
                      .SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID,
                    href: tablehref(
                      base.basepath,
                      base.document_id,
                      sb_auth_users
                    ),
                    label: "auth.users",
                    icon: "supabase",
                    section: "Tables",
                    data: {
                      readonly: true,
                    },
                  } satisfies TableMenuItem,
                ]
              : []
          ),
        menus: [],
      },
    },
    ...initialDatagridState(),
    datagrid_table_id: init.tables.length > 0 ? init.tables[0].id : null,
    tables: tables.concat(should_add_sb_auth_users ? [sb_auth_users] : []),
    // @ts-expect-error
    tablespace: {
      // @ts-expect-error
      ...init.tables.reduce((acc: Record<GDocTableID, TTablespace>, t) => {
        // @ts-expect-error
        acc[t.id] = {
          provider: t.x_sb_main_table_connection ? "x-supabase" : "grida",
          readonly: false,
          realtime: true,
          stream: [],
          // @ts-expect-error
        } satisfies TTablespace;
        return acc;
      }, {}),
      [EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID]:
        "noop" as never,
    },
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
    sidebar: {
      mode: initial_sidebar_mode[init.doctype],
      mode_data: { tables: [], menus: [] },
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
          provider: "x-supabase",
          row_keyword: "row",
          icon: "supabase",
          name: init.connections.supabase.main_supabase_table.sb_table_name,
          label: init.connections.supabase.main_supabase_table.sb_table_name,
          description: null,
          readonly: false,
          x_sb_main_table_connection: xsbmtinit(init.connections.supabase)!,
        } satisfies GDocTable,
      }
    : {
        [EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID]: {
          id: EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID,
          provider: "grida",
          row_keyword: "response",
          icon: "table",
          name: "response",
          label: "Responses",
          description: null,
          readonly: false,
        } satisfies GDocTable,
        [EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID]: {
          id: EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID,
          provider: "custom",
          row_keyword: "session",
          icon: "table",
          name: "session",
          label: "Sessions",
          description: null,
          readonly: true,
        } satisfies GDocTable,
        [EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID]: {
          id: EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID,
          provider: "custom",
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
          data: {
            readonly: false,
          },
        } satisfies TableMenuItem,
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
          data: {
            readonly: false,
          },
        } satisfies TableMenuItem,
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
          data: {
            readonly: true,
          },
        } satisfies TableMenuItem,
      ];

  const tableids = Object.getOwnPropertySymbols(tables);
  const values = tableids.map((id) => (tables as any)[id]);

  return {
    ...base,
    supabase_project: init.connections?.supabase?.supabase_project ?? null,
    connections: {
      store_id: init.connections?.store_id,
      supabase: init.connections?.supabase,
    },
    theme: init.theme,
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
            data: {},
          },
        ],
      },
    },
    tables: values,

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
      form_id: init.form_id,
      form_title: init.form_title,
      campaign: init.campaign,
      ending: init.ending,
      fields: init.fields,
      form_security: init.form_security,
      available_field_ids: block_available_field_ids,
    },
    tablespace: {
      [EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID]: {
        provider: "grida",
        readonly: false,
        realtime: true,
        stream: [],
      },
      [EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID]: {
        provider: "custom",
        readonly: true,
        stream: undefined,
        realtime: false,
      },
      [EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID]: {
        provider: "custom",
        readonly: true,
        stream: undefined,
        realtime: false,
      },
      [EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID]: {
        provider: "x-supabase",
        readonly: true,
        stream: [],
        realtime: false,
      },
      // noop
      [EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID]:
        "noop" as never,
    },
    ...initialDatagridState(),
    datagrid_table_id: is_main_table_supabase
      ? EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
      : EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID,
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
      data: {},
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
      data: {},
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
      data: {},
    },
    {
      section: "Design",
      id: "ending",
      label: "Ending Page",
      href: `/${basepath}/${document_id}/form/end`,
      icon: "file",
      level: 1,
      data: {},
    },
    {
      section: "Design",
      id: "responses",
      label: "Responses",
      href: `/${basepath}/${document_id}/data/responses`,
      icon: "table",
      level: 1,
      data: {},
    },
  ];
}

export function schematableinit(table: {
  id: string;
  name: string;
  description?: string | null;
  attributes: FormFieldDefinition[];
  x_sb_main_table_connection?: TableXSBMainTableConnection;
}): GDocSchemaTable {
  if (table.x_sb_main_table_connection) {
    // table shall be readonly if it is a view or if it has no primary key
    // we don't support patch operations without pk
    const readonly =
      SupabasePostgRESTOpenApi.table_methods_is_get_only(
        table.x_sb_main_table_connection.sb_postgrest_methods
      ) || table.x_sb_main_table_connection.pk === undefined;

    return {
      provider: "x-supabase",
      id: table.id,
      name: table.name,
      label: table.name,
      description: table.description || null,
      readonly: readonly,
      row_keyword: "row",
      icon: "supabase",
      attributes: table.attributes,
      x_sb_main_table_connection: table.x_sb_main_table_connection,
    } satisfies GDocSchemaTable;
  } else {
    return {
      provider: "grida",
      id: table.id,
      name: table.name,
      label: table.name,
      description: table.description || null,
      readonly: false,
      row_keyword: "row",
      icon: "table",
      attributes: table.attributes,
    } satisfies GDocSchemaTable;
  }
}

function xsbmtinit(
  conn?: GridaXSupabase.XSupabaseMainTableConnectionState
): TableXSBMainTableConnection | undefined {
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
    sb_table_id: conn.main_supabase_table.id,
    sb_schema_name: conn.main_supabase_table.sb_schema_name as string,
    sb_table_name: conn.main_supabase_table.sb_table_name as string,
    sb_table_schema: conn.main_supabase_table.sb_table_schema,
    sb_postgrest_methods: conn.main_supabase_table.sb_postgrest_methods,
    pks: parsed?.pks || [],
    pk: (parsed?.pks?.length || 0) > 0 ? parsed?.pks[0] : undefined,
  } satisfies TableXSBMainTableConnection;
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
