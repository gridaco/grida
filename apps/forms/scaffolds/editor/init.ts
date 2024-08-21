import { editorbasepath } from "@/lib/forms/url";
import type {
  BaseDocumentEditorInit,
  BaseDocumentEditorState,
  DatabaseDocumentEditorInit,
  EditorInit,
  FormDocumentEditorInit,
  FormEditorState,
  MenuItem,
  SiteDocumentEditorInit,
} from "./state";
import { blockstreeflat } from "@/lib/forms/tree";
import { SYM_LOCALTZ, GridaEditorSymbols } from "./symbols";
import { GridaSupabase } from "@/types";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";

export function initialEditorState(init: EditorInit): FormEditorState {
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
    sidebar: {
      mode: initial_sidebar_mode[init.doctype],
    },
    row_editor: {
      open: false,
    },
    customers: {
      stream: undefined,
      realtime: false,
    },
    customer_editor: {
      open: false,
    },
    insertmenu: {
      open: false,
    },
    dateformat: "datetime",
    datetz: SYM_LOCALTZ,
  };
}

/**
 * // FIXME: not ready
 * @deprecated @beta
 * @param init
 * @returns
 */
function initialDatabaseEditorState(
  init: DatabaseDocumentEditorInit
): FormEditorState {
  const base = initialBaseDocumentEditorState(init);
  // @ts-ignore
  return {
    ...base,
    document: {
      pages: [],
      nodes: [],
      templatedata: {},
    },
    tables: init.tables.map((t) => ({
      type: "schema",
      name: t.name,
      icon: "table",
      views: [
        {
          // TODO:
          id: t.name,
          row_keyword: "row",
          type: "table",
          label: t.name,
          name: t.name,
        },
      ],
    })),
    // TODO: move me under a schema
    fields: [],
  };
}

/**
 * // FIXME: not ready
 * @deprecated @beta
 * @param init
 * @returns
 */
function initialSiteEditorState(init: SiteDocumentEditorInit): FormEditorState {
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
    tables: [
      {
        type: "schema",
        name: "Campaigns",
        icon: "table",
        views: [],
      },
    ],
  };
}

function initialFormEditorState(init: FormDocumentEditorInit): FormEditorState {
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

  return {
    ...base,
    connections: {
      store_id: init.connections?.store_id,
      supabase: init.connections?.supabase,
    },
    theme: init.theme,
    form_id: init.form_id,
    form_title: init.form_title,
    tables: init.connections?.supabase?.main_supabase_table
      ? [
          {
            name: init.connections.supabase.main_supabase_table.sb_table_name,
            type: "response",
            icon: "supabase",
            views: [
              {
                id: GridaEditorSymbols.Table
                  .SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID,
                type: "x-supabase-main-table",
                row_keyword: "row",
                name: init.connections.supabase.main_supabase_table
                  .sb_table_name,
                label:
                  init.connections.supabase.main_supabase_table.sb_table_name,
              },
            ],
          },
          {
            name: "auth.users",
            type: "x-supabase-auth.users",
            icon: "supabase",
            views: [
              {
                id: GridaEditorSymbols.Table
                  .SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID,
                row_keyword: "user",
                type: "x-supabase-auth.users",
                name: "auth.users",
                label: "auth.users",
              },
            ],
          },
        ]
      : [
          {
            name: "Responses",
            type: "response",
            icon: "table",
            views: [
              {
                id: GridaEditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID,
                row_keyword: "response",
                type: "response",
                name: "response",
                label: "Responses",
              },
              {
                id: GridaEditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID,
                row_keyword: "session",
                type: "session",
                name: "session",
                label: "Sessions",
              },
            ],
          },
          {
            name: "Customers",
            type: "customer",
            icon: "user",
            views: [
              {
                id: GridaEditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID,
                row_keyword: "customer",
                type: "customer",
                name: "customer",
                label: "Customers",
              },
            ],
          },
        ],
    campaign: init.campaign,
    form_security: init.form_security,
    ending: init.ending,
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
    fields: init.fields,
    responses: {
      realtime: true,
      stream: [],
    },
    sessions: {
      stream: undefined,
      realtime: false,
    },
    datagrid_selected_rows: new Set(),
    available_field_ids: block_available_field_ids,
    datagrid_rows_per_page: 100,
    datagrid_table_refresh_key: 0,
    datagrid_isloading: false,
    datagrid_table_id: is_main_table_supabase
      ? GridaEditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
      : GridaEditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID,
    datagrid_filter: {
      masking_enabled: false,
      empty_data_hidden: true,
    },
    datagrid_orderby: {},
    field_editor: {
      open: false,
    },
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
}): MenuItem[] {
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
}): MenuItem[] {
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
