import { editorbasepath } from "@/lib/forms/url";
import type {
  BaseDocumentEditorInit,
  BaseDocumentEditorState,
  SchemaDocumentEditorInit,
  EditorInit,
  FormDocumentEditorInit,
  EditorState,
  SiteDocumentEditorInit,
  IDataGridState,
  GDocTableID,
  GDocTable,
  TTablespace,
  TableXSBMainTableConnection,
  GDocSchemaTable,
  TableMenuItem,
  CanvasDocumentEditorInit,
  BucketDocumentEditorInit,
  SchemaMayVaryDocument,
} from "./state";
import { blockstreeflat } from "@/lib/forms/tree";
import { SYM_LOCALTZ, EditorSymbols } from "./symbols";
import {
  FormFieldDefinition,
  FormStartPageSchema,
  GridaXSupabase,
  SchemaMayVaryDocumentServerObject,
} from "@/types";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { nanoid } from "nanoid";
import { DataGridLocalPreferencesStorage } from "./storage/datagrid.storage";
import { Data } from "@/lib/data";
import { FormStartPage } from "@/theme/templates/formstart";
import {
  IDocumentEditorState,
  initDocumentEditorState,
} from "@/grida-react-canvas";
import type { MenuGroup } from "./menu";
import { grida } from "@/grida";
// import * as samples from "@/theme/templates/formcollection/samples";

export function initialEditorState(init: EditorInit): EditorState {
  switch (init.doctype) {
    case "v0_form":
      return initialFormEditorState(init);
    case "v0_site":
      return initialSiteEditorState(init);
    case "v0_schema":
      return initialDatabaseEditorState(init);
    case "v0_bucket":
      return initialBucketEditorState(init);
    case "v0_canvas":
      return initialCanvasEditorState(init);
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
): Omit<BaseDocumentEditorState, "documents" | "pages" | "selected_page_id"> {
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
    user_id: init.user_id,
    cursor_id: nanoid(4), // 4 is enough for multiplayer
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

export function initialDatagridState(
  view_id?: string
): Omit<IDataGridState, "datagrid_table_id"> {
  const cleared: Omit<IDataGridState, "datagrid_table_id"> = {
    datagrid_selected_rows: new Set(),
    datagrid_query: {
      ...Data.Relation.INITIAL_QUERY_STATE,
      q_text_search: {
        query: "",
        type: "websearch",
        column: null,
      },
    },
    datagrid_query_estimated_count: null,
    datagrid_isloading: false,
    datagrid_local_filter: {
      masking_enabled: false,
      empty_data_hidden: true,
    },
    datagrid_selected_cell: null,
  };

  if (view_id) {
    // used by reducer
    // TODO: it is a good practive to do this in a hook.
    // I'm too lazy to do it now.
    const pref = DataGridLocalPreferencesStorage.get(view_id);
    if (pref) {
      return {
        ...cleared,
        datagrid_local_filter: {
          ...cleared.datagrid_local_filter!,
          masking_enabled: pref.masking_enabled ?? false,
        },
        datagrid_query: {
          ...cleared.datagrid_query!,
          q_predicates: pref.predicates ?? [],
          q_orderby: pref.orderby ?? {},
        },
      };
    }
  }
  return cleared;
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
    type: "item",
    id: tb.id,
    label: tb.name,
    icon: tb.x_sb_main_table_connection ? "supabase" : "table",
    link: {
      href: tablehref(basepath, document_id, tb),
    },
    data: {
      readonly: tb.x_sb_main_table_connection
        ? SupabasePostgRESTOpenApi.table_methods_is_get_only(
            tb.x_sb_main_table_connection?.sb_postgrest_methods
          )
        : false,
      rules: {
        delete_restricted: false,
      },
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
    provider: "x-supabase-auth",
    id: EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID,
    row_keyword: "user",
    icon: "supabase",
    name: "auth.users",
    label: "auth.users",
    description: null,
    readonly: true,
    rules: {
      delete_restricted: true,
    },
    view: "table",
  } satisfies GDocTable;

  const should_add_sb_auth_users =
    init.supabase_project && tables.some((t) => t.provider === "x-supabase");

  return {
    ...base,
    supabase_project: init.supabase_project,
    connections: {},
    pages: [],
    documents: {},
    sidebar: {
      mode: initial_sidebar_mode[init.doctype],
      mode_build: {
        disabled: true,
      },
      mode_data: {
        disabled: false,
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
                    type: "item",
                    id: EditorSymbols.Table
                      .SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID,
                    link: {
                      href: tablehref(
                        base.basepath,
                        base.document_id,
                        sb_auth_users
                      ),
                    },
                    label: "auth.users",
                    icon: "supabase",
                    // section: "Tables",
                    data: {
                      readonly: true,
                      rules: {
                        delete_restricted: true,
                      },
                    },
                  } satisfies TableMenuItem,
                ]
              : []
          ),
        menus: [],
      },
      mode_connect: {
        disabled: false,
      },
    },
    ...initialDatagridState(),
    datagrid_table_id: init.tables.length > 0 ? init.tables[0].id : null,
    tables: tables.concat(should_add_sb_auth_users ? [sb_auth_users] : []),
    // @ts-expect-error TODO: clear
    tablespace: {
      // @ts-expect-error TODO: clear
      ...init.tables.reduce((acc: Record<GDocTableID, TTablespace>, t) => {
        // @ts-expect-error TODO: clear
        acc[t.id] = {
          provider: t.x_sb_main_table_connection ? "x-supabase" : "grida",
          readonly: false,
          realtime: true,
          stream: [],
          // @ts-expect-error TODO: clear
        } satisfies TTablespace;
        return acc;
      }, {}),
      [EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID]:
        "noop" as never,
    },
    transactions: [],
  };
}

function initialBucketEditorState(init: BucketDocumentEditorInit): EditorState {
  const base = initialBaseDocumentEditorState(init);

  // @ts-ignore
  return {
    ...base,
    pages: [],
    selected_page_id: "files",
    documents: {},
    sidebar: {
      mode: "project",
      mode_build: {
        disabled: true,
      },
      mode_data: {
        disabled: true,
      },
      mode_connect: {
        disabled: true,
      },
    },
    tables: [],
  };
}
/**
 * // FIXME: not ready
 * @deprecated @beta
 * @param init
 * @returns
 */
function initialSiteEditorState(init: SiteDocumentEditorInit): EditorState {
  // documents: {
  //   ["site"]: initDocumentEditorState({
  //     editable: true,
  //     debug: false,
  //     document: {
  //       nodes: {},
  //       scene: {
  //         type: "scene",
  //         children: ["root"],
  //         guides: [],
  //         constraints: {
  //           children: "single",
  //         },
  //       },
  //     },
  //     templates: {
  //       ["formcollection_sample_001_the_bundle"]: {
  //         name: "formcollection_sample_001_the_bundle",
  //         type: "template",
  //         properties: {},
  //         default: {},
  //         // props: samples["formcollection_sample_001_the_bundle"] as any,
  //         // overrides: {},
  //         version: "0.0.0",
  //         nodes: {},
  //       },
  //     },
  //   }),
  // },

  // {
  //   type: "group",
  //   label: "Pages",
  //   children: [
  //     {
  //       type: "item",
  //       id: "home",
  //       label: "home",
  //       link: {
  //         href: `/${basepath}/${document_id}/design`,
  //       },
  //       icon: "home",
  //     },
  //     {
  //       type: "folder",
  //       id: "/invite",
  //       label: "/invite",
  //       icon: "folder",
  //       children: [
  //         {
  //           type: "folder",
  //           id: "/invite/<slug>",
  //           label: "[slug]",
  //           icon: "folder",
  //           children: [
  //             {
  //               type: "item",
  //               id: "/invite/<slug>/page",
  //               label: "page",
  //               link: {
  //                 href: `?scene=/invite/<slug>/page`,
  //               },
  //               icon: "file",
  //             },
  //           ],
  //         },
  //       ],
  //     },
  //     {
  //       type: "folder",
  //       id: "/join",
  //       label: "/join",
  //       icon: "folder",
  //       children: [
  //         {
  //           type: "folder",
  //           id: "/join/<slug>",
  //           label: "[slug]",
  //           icon: "folder",
  //           children: [
  //             {
  //               type: "item",
  //               id: "/join/<slug>/page",
  //               label: "page",
  //               link: {
  //                 href: `?scene=/join/<slug>/page`,
  //               },
  //               icon: "file",
  //             },
  //           ],
  //         },
  //       ],
  //     },
  //     {
  //       type: "item",
  //       id: "/portal",
  //       label: "portal",
  //       link: {
  //         href: `?scene=/portal`,
  //       },
  //       icon: "file",
  //     },
  //   ],
  // }

  const base = initialBaseDocumentEditorState(init);
  // @ts-ignore
  return {
    ...base,
    pages: sitedocumentpagesinit({
      basepath: base.basepath,
      document_id: init.document_id,
    }),
    selected_page_id: "site",
    documents: {
      ["site"]: {
        __schema_version: grida.program.document.SCHEMA_VERSION,
        __schema_valid: true,
        state: initDocumentEditorState({
          editable: true,
          debug: false,
          document: {
            nodes: {
              invite: {
                id: "invite",
                name: "Invite Page",
                type: "template_instance",
                template_id: "tmp-2503-invite",
                position: "absolute",
                removable: false,
                active: true,
                locked: false,
                width: 375,
                height: "auto",
                properties: {},
                props: {},
                overrides: {},
              },
              join: {
                id: "join",
                name: "Join Page",
                type: "template_instance",
                template_id: "tmp-2503-join",
                position: "absolute",
                removable: false,
                active: true,
                locked: false,
                width: 375,
                height: "auto",
                properties: {},
                props: {},
                overrides: {},
                top: 0,
                left: 0,
              },
              join_hello: {
                id: "join_hello",
                name: "Join Hello (Overlay)",
                type: "template_instance",
                template_id: "tmp-2503-join-hello",
                position: "absolute",
                removable: false,
                active: true,
                locked: false,
                width: 375,
                height: 812,
                top: 0,
                left: -500,
                properties: {},
                props: {},
                overrides: {},
              },
              portal: {
                id: "portal",
                name: "Portal Page",
                type: "template_instance",
                template_id: "tmp-2503-portal",
                position: "absolute",
                removable: false,
                active: true,
                locked: false,
                width: 375,
                height: "auto",
                properties: {},
                props: {},
                overrides: {},
                top: 0,
                left: 0,
              },
              portal_verify: {
                id: "portal_verify",
                name: "Verify (Overlay)",
                type: "template_instance",
                template_id: "tmp-2503-portal-verify",
                position: "absolute",
                removable: false,
                active: true,
                locked: false,
                width: 375,
                height: "auto",
                properties: {},
                props: {},
                overrides: {},
                top: 0,
                left: 500,
              },
            },
            entry_scene_id: "invite",
            scenes: {
              invite: {
                type: "scene",
                id: "invite",
                name: "Invite",
                children: ["invite"],
                guides: [],
                constraints: {
                  children: "multiple",
                },
                order: 1,
              },
              join: {
                type: "scene",
                id: "join",
                name: "Join",
                children: ["join", "join_hello"],
                guides: [],
                constraints: {
                  children: "multiple",
                },
                order: 2,
              },
              portal: {
                type: "scene",
                id: "portal",
                name: "Portal",
                children: ["portal", "portal_verify"],
                guides: [],
                constraints: {
                  children: "multiple",
                },
                order: 3,
              },
            },
          },
          templates: {
            ["tmp-2503-invite"]: {
              name: "Invite",
              type: "template",
              properties: {},
              default: {},
              version: "0.0.0",
              nodes: {},
            },
            ["tmp-2503-join"]: {
              name: "Join",
              type: "template",
              properties: {},
              default: {},
              version: "0.0.0",
              nodes: {},
            },
            ["tmp-2503-portal"]: {
              name: "Portal",
              type: "template",
              properties: {},
              default: {},
              version: "0.0.0",
              nodes: {},
            },
          },
        }),
      },
    },
    sidebar: {
      mode: initial_sidebar_mode[init.doctype],
      mode_build: {
        disabled: false,
      },
      mode_data: {
        disabled: false,
        tables: [],
        menus: [],
      },
      mode_connect: {
        disabled: false,
      },
    },
    tables: [],
  };
}

function __init_canvas(
  data: unknown | SchemaMayVaryDocumentServerObject
): SchemaMayVaryDocument<IDocumentEditorState> | undefined {
  // data is empty = no start page is set.
  if (!data) return undefined;

  // check the version
  if (
    (data as SchemaMayVaryDocumentServerObject).__schema_version !==
    "0.0.1-beta.1+20250303"
  ) {
    return {
      __schema_version: (data as SchemaMayVaryDocumentServerObject)
        .__schema_version,
      __schema_valid: false,
      state: null,
    };
  }

  const valid = data as SchemaMayVaryDocumentServerObject;

  return {
    __schema_version: valid.__schema_version,
    __schema_valid: true,
    state: {
      ...initDocumentEditorState({
        editable: true,
        debug: false,
        document: valid,
      }),
    },
  };
}

function __init_form_start_page_state(
  data: unknown | FormStartPageSchema
): BaseDocumentEditorState["documents"]["form/startpage"] | undefined {
  // data is empty = no start page is set.
  if (!data) return undefined;

  // check the version
  if (
    (data as FormStartPageSchema).__schema_version !== "0.0.1-beta.1+20250303"
  ) {
    return {
      __schema_version: (data as FormStartPageSchema).__schema_version,
      __schema_valid: false,
      state: null,
    };
  }

  const valid = data as FormStartPageSchema;

  return {
    __schema_version: valid.__schema_version,
    __schema_valid: true,
    state: {
      template_id: valid.template_id,
      ...initDocumentEditorState({
        editable: true,
        debug: false,
        document: valid,
        templates: {
          [valid.template_id]: FormStartPage.getTemplate(valid.template_id),
        },
      }),
    },
  };
}

/**
 * // FIXME: not ready
 * @deprecated @beta
 * @param init
 * @returns
 */
function initialCanvasEditorState(init: CanvasDocumentEditorInit): EditorState {
  const base = initialBaseDocumentEditorState(init);
  // @ts-ignore
  return {
    ...base,
    pages: [],
    selected_page_id: "canvas",
    documents: {
      ["canvas"]: __init_canvas(init.document),
    },
    sidebar: {
      mode: "build",
      mode_data: { disabled: true },
      mode_build: { disabled: false },
      mode_connect: { disabled: true },
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
          x_sb_main_table_connection: xsb_table_conn_init({
            sb_table_id: init.connections.supabase.main_supabase_table.id,
            ...init.connections.supabase.main_supabase_table,
          })!,
          rules: {
            delete_restricted: true,
          },
          view: "table",
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
          rules: {
            delete_restricted: true,
          },
          view: "table",
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
          rules: {
            delete_restricted: true,
          },
          view: "table",
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
          rules: {
            delete_restricted: true,
          },
          view: "table",
        } satisfies GDocTable,
      };

  const tablemenus = init.connections?.supabase?.main_supabase_table
    ? [
        {
          type: "item",
          id: EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID,
          link: {
            href: tablehref(
              basepath,
              document_id,
              (tables as any)[
                EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
              ]
            ),
          },
          label: "Responses",
          icon: "supabase",
          // section: "Tables",
          data: {
            readonly: false,
            rules: {
              delete_restricted: true,
            },
          },
        } satisfies TableMenuItem,
      ]
    : [
        {
          type: "item",
          id: EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID,
          link: {
            href: tablehref(
              basepath,
              document_id,
              (tables as any)[
                EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
              ]
            ),
          },
          label: "Responses",
          icon: "table",
          // section: "Tables",
          data: {
            readonly: false,
            rules: {
              delete_restricted: true,
            },
          },
        } satisfies TableMenuItem,
        {
          type: "item",
          id: EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID,
          link: {
            href: tablehref(
              basepath,
              document_id,
              (tables as any)[
                EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID
              ]
            ),
          },
          label: "Sessions",
          icon: "table",
          // section: "Tables",
          data: {
            readonly: true,
            rules: {
              delete_restricted: true,
            },
          },
        } satisfies TableMenuItem,
        {
          type: "item",
          id: EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID,
          link: {
            href: tablehref(
              basepath,
              document_id,
              (tables as any)[EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID]
            ),
          },
          label: "Customers",
          icon: "user",
          // section: "Tables",
          data: {
            readonly: true,
            rules: {
              delete_restricted: true,
            },
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
        disabled: false,
        tables: tablemenus,
        menus: [
          {
            type: "group",
            label: "Analytics",
            children: [
              {
                type: "item",
                id: `/${basepath}/${document_id}/data/analytics`,
                link: {
                  href: `/${basepath}/${document_id}/data/analytics`,
                },
                icon: "chart",
                label: "Realtime",
              },
            ],
          },
        ],
      },
      mode_build: {
        disabled: false,
      },
      mode_connect: {
        disabled: false,
      },
    },
    tables: values,

    blocks: blockstreeflat(init.blocks),
    pages: formdocumentpagesinit({
      basepath: base.basepath,
      document_id: init.document_id,
    }),
    selected_page_id: "form",
    documents: {
      "form/startpage": __init_form_start_page_state(init.start),
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
    transactions: [],
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
}): MenuGroup<{ id: string }>[] {
  // {
  //   id: "site",
  //   label: "home",
  //   link: {
  //     href: `/${basepath}/${document_id}/design`,
  //   },
  // },
  return [];
}

function formdocumentpagesinit({
  basepath,
  document_id,
}: {
  basepath: string;
  document_id: string;
}): MenuGroup<{ id: string }>[] {
  return [
    {
      type: "group",
      label: "Design",
      children: [
        {
          defaultOpen: true,
          type: "folder",
          id: "campaign",
          label: "Campaign",
          link: {
            href: `/${basepath}/${document_id}/form`,
          },
          icon: "folder",
          children: [
            // TODO: not ready
            {
              type: "item",
              id: "form/startpage",
              label: "Cover",
              disabled: true,
              link: {
                href: `/${basepath}/${document_id}/form/start`,
              },
              icon: "file",
            },
            {
              type: "item",
              id: "form",
              label: "Main",
              link: {
                href: `/${basepath}/${document_id}/form/edit`,
              },
              icon: "file",
            },
            {
              type: "item",
              id: "ending",
              label: "Ending",
              link: {
                href: `/${basepath}/${document_id}/form/end`,
              },
              icon: "file",
            },
          ],
        },
      ],
    },
    {
      type: "group",
      label: "Data",
      children: [
        {
          type: "folder",
          id: "results",
          label: "Results",
          icon: "folder",
          children: [
            {
              type: "item",
              id: "responses",
              label: "Responses",
              link: {
                href: `/${basepath}/${document_id}/data/responses`,
              },
              icon: "table",
            },
          ],
        },
      ],
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
      rules: {
        delete_restricted: false,
      },
      view: "table",
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
      rules: {
        delete_restricted: false,
      },
      view: "table",
    } satisfies GDocSchemaTable;
  }
}

export function xsb_table_conn_init(conn?: {
  supabase_project_id: number;
  sb_schema_name: string;
  sb_table_name: string;
  sb_table_id: number;
  sb_table_schema: GridaXSupabase.JSONSChema;
  sb_postgrest_methods: GridaXSupabase.XSBPostgrestMethod[];
}): TableXSBMainTableConnection | undefined {
  // TODO: need inspection - will supbaseconn present even when main table is not present?
  // if yes, we need to adjust the state to be nullable
  if (!conn) return undefined;

  const def: Data.Relation.TableDefinition = {
    name: conn.sb_table_name,
    ...SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
      conn.sb_table_schema
    ),
  };

  return {
    supabase_project_id: conn.supabase_project_id,
    sb_table_id: conn.sb_table_id,
    sb_schema_name: conn.sb_schema_name as string,
    sb_table_name: conn.sb_table_name as string,
    sb_table_schema: conn.sb_table_schema,
    sb_postgrest_methods: conn.sb_postgrest_methods,
    pks: def.pks,
    pk: def.pks[0],
    definition: def,
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
    case EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID:
      return `/${basepath}/${document_id}/data/responses/sessions`;
    case EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID:
      return `/${basepath}/${document_id}/data/customers`;
    case EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID:
      return `/${basepath}/${document_id}/data/x/auth.users`;
  }

  // v0_schema table
  return `/${basepath}/${document_id}/data/table/${table.name}`;
}
