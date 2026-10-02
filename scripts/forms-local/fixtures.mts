import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Database } from "../../database/database-generated.types.ts";

export type FixtureSetup = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};
export type ExecuteSql = (sql: string) => Promise<string>;
export type FixtureRequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
  schema?: string;
  allowError?: boolean;
  headers?: Record<string, string>;
};
export type FixtureResponse<T = unknown> = {
  status: number;
  ok: boolean;
  data: T | null;
};
export type OtpState = { attempts: number; consumed: boolean };
type Schema = keyof Database;
type Table<S extends Schema> = keyof Database[S]["Tables"] & string;
type TableShape<
  S extends Schema,
  T extends Table<S>,
  Shape extends "Row" | "Insert" | "Update",
> = Database[S]["Tables"][T] extends Record<Shape, infer Value> ? Value : never;
type FieldRow = Database["grida_forms"]["Tables"]["attribute"]["Row"];
type FieldDefinition = Omit<
  Database["grida_forms"]["Tables"]["attribute"]["Insert"],
  "form_id"
>;
export type FixtureForm<Fields extends string = string> = {
  id: string;
  projectId: number;
  documentId: string;
  fields: Record<Fields, FieldRow>;
};
type Persona = { token: string; id: string };
type PersonaName = "insider" | "alice" | "outsider";

// This overlay belongs only to the runner-owned auth-local stack. It is not a
// migration, base seed, or hosted-project setup command. Teardown destroys the
// owned stack, including committed HTTP writes, object bytes and Vault secrets.
export const FILE_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64"
);
export const RESPONSE_BUCKET = "grida-forms-response";

export async function eventually(
  check: () => boolean | Promise<boolean>,
  description: string,
  timeout = 10_000
): Promise<void> {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}`);
}

export function createFixtureClient({ setup }: { setup: FixtureSetup }) {
  assert.equal(setup.apiUrl, "http://127.0.0.1:55431");
  assert.equal(typeof setup.serviceRoleKey, "string");

  // Never inherit credentials or follow a redirect. Errors deliberately omit
  // request/response bodies, which can contain fixture access tokens and OTPs.
  async function request<T = unknown>(
    path: string,
    {
      method = "GET",
      body,
      token = setup.serviceRoleKey,
      schema = "public",
      allowError = false,
      headers = {},
    }: FixtureRequestOptions = {}
  ): Promise<FixtureResponse<T>> {
    assert(path.startsWith("/") && !path.startsWith("//"));
    const url = new URL(path, setup.apiUrl);
    assert.equal(url.origin, setup.apiUrl);
    const options: RequestInit = {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        apikey: setup.anonKey,
        Authorization: `Bearer ${token}`,
        "Accept-Profile": schema,
        "Content-Profile": schema,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        Prefer: "return=representation",
        ...headers,
      },
    };
    if (body !== undefined) {
      assert(
        !["GET", "HEAD"].includes(method),
        "Read requests cannot carry a body"
      );
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!allowError && !response.ok) {
      const code =
        data && typeof data === "object" && "code" in data
          ? data.code
          : undefined;
      throw new Error(
        `Fixture ${method} ${url.pathname} failed (${response.status}, ${code ?? "unknown"})`
      );
    }
    // HTTP decoding is the fixture boundary. A caller supplies its expected wire
    // shape; scenario assertions—not application validators—verify the contract.
    return { status: response.status, ok: response.ok, data: data as T | null };
  }

  async function rows<S extends Schema, T extends Table<S>>(
    schema: S,
    table: T,
    query?: string,
    options?: FixtureRequestOptions
  ): Promise<TableShape<S, T, "Row">[]>;
  async function rows<Row = Record<string, unknown>>(
    schema: string,
    table: string,
    query?: string,
    options?: FixtureRequestOptions
  ): Promise<Row[]>;
  async function rows(
    schema: string,
    table: string,
    query = "select=*",
    options: FixtureRequestOptions = {}
  ): Promise<unknown[]> {
    const result = await request(`/rest/v1/${table}?${query}`, {
      schema,
      ...options,
    });
    assert(Array.isArray(result.data), `Expected rows from ${schema}.${table}`);
    return result.data;
  }
  async function insert<S extends Schema, T extends Table<S>>(
    schema: S,
    table: T,
    body: TableShape<S, T, "Insert"> | TableShape<S, T, "Insert">[]
  ): Promise<TableShape<S, T, "Row">[]>;
  async function insert<Row = Record<string, unknown>>(
    schema: string,
    table: string,
    body: unknown
  ): Promise<Row[]>;
  async function insert(
    schema: string,
    table: string,
    body: unknown
  ): Promise<unknown[]> {
    return rows(schema, table, "select=*", { method: "POST", body });
  }
  async function patch<S extends Schema, T extends Table<S>>(
    schema: S,
    table: T,
    query: string,
    body: TableShape<S, T, "Update">
  ): Promise<TableShape<S, T, "Row">[]>;
  async function patch<Row = Record<string, unknown>>(
    schema: string,
    table: string,
    query: string,
    body: unknown
  ): Promise<Row[]>;
  async function patch(
    schema: string,
    table: string,
    query: string,
    body: unknown
  ): Promise<unknown[]> {
    return rows(schema, table, query, { method: "PATCH", body });
  }
  async function one<S extends Schema, T extends Table<S>>(
    schema: S,
    table: T,
    query: string
  ): Promise<TableShape<S, T, "Row">>;
  async function one<Row = Record<string, unknown>>(
    schema: string,
    table: string,
    query: string
  ): Promise<Row>;
  async function one(
    schema: string,
    table: string,
    query: string
  ): Promise<unknown> {
    const result = await rows(schema, table, query);
    assert.equal(result.length, 1, `Expected one ${schema}.${table} row`);
    return result[0];
  }
  return { request, rows, insert, patch, one };
}

export type FixtureClient = ReturnType<typeof createFixtureClient>;

export async function createFixtures({
  setup,
  executeSql,
}: {
  setup: FixtureSetup;
  executeSql: ExecuteSql;
}) {
  assert.equal(typeof executeSql, "function");
  const run = randomUUID().replaceAll("-", "").slice(0, 12);
  const { request, rows, insert, patch, one } = createFixtureClient({ setup });
  const personas = {} as Record<PersonaName, Persona>;
  for (const [name, email] of [
    ["insider", "insider@grida.co"],
    ["alice", "alice@acme.com"],
    ["outsider", "random@example.com"],
  ] as const) {
    const { data } = await request<{
      access_token: string;
      user: { id: string };
    }>("/auth/v1/token?grant_type=password", {
      method: "POST",
      token: setup.anonKey,
      body: { email, password: "password" },
    });
    assert.equal(typeof data?.access_token, "string");
    assert(data);
    personas[name] = { token: data.access_token, id: data.user.id };
  }
  type SeedProject = Pick<
    Database["public"]["Tables"]["project"]["Row"],
    "id" | "organization_id"
  >;
  const seedA = await one<SeedProject>(
    "public",
    "project",
    "select=id,organization_id&name=eq.dev"
  );
  const seedB = await one<SeedProject>(
    "public",
    "project",
    "select=id,organization_id&name=eq.acme-project"
  );
  assert.notEqual(seedA.organization_id, seedB.organization_id);
  // Each attempt owns fresh children of the canonical seeded organizations.
  // connection_supabase has one connected project per Grida project; sharing
  // dev across attempts would collide after an interrupted overlay setup.
  const [projectA] = await insert("public", "project", {
    organization_id: seedA.organization_id,
    name: `forms-a-${run}`,
  });
  const [projectB] = await insert("public", "project", {
    organization_id: seedB.organization_id,
    name: `forms-b-${run}`,
  });

  // auth-local intentionally does not copy root bucket configuration. Recreate
  // only the Forms bucket's public/size/MIME policy from supabase/config.toml.
  const existing = await request(`/storage/v1/bucket/${RESPONSE_BUCKET}`, {
    allowError: true,
  });
  if (!existing.ok) {
    assert(
      [400, 404].includes(existing.status),
      "Unexpected bucket lookup failure"
    );
    await request("/storage/v1/bucket", {
      method: "POST",
      body: {
        id: RESPONSE_BUCKET,
        name: RESPONSE_BUCKET,
        public: true,
        file_size_limit: 30 * 1024 * 1024,
        allowed_mime_types: [
          "image/*",
          "video/*",
          "audio/*",
          "application/pdf",
        ],
      },
    });
  }
  const bucket = await request<{ public: boolean }>(
    `/storage/v1/bucket/${RESPONSE_BUCKET}`
  );
  assert.equal(
    bucket.data?.public,
    true,
    "Forms response bucket remains public"
  );

  async function form<
    const Definitions extends Record<string, FieldDefinition>,
  >(
    projectId: number,
    label: string,
    definitions: Definitions
  ): Promise<FixtureForm<keyof Definitions & string>> {
    const [created] = await insert("grida_forms", "form", {
      project_id: projectId,
      title: `Forms baseline ${label} ${run}`,
      name: `forms_${label}_${run}`,
    });
    const [document] = await insert("public", "document", {
      doctype: "v0_form",
      project_id: projectId,
    });
    await insert("grida_forms", "form_document", {
      id: document.id,
      form_id: created.id,
      project_id: projectId,
      lang: "en",
    });
    await patch("grida_forms", "form", `id=eq.${created.id}`, {
      default_form_page_id: document.id,
    });
    const fields: Record<string, FieldRow> = {};
    for (const [key, definition] of Object.entries(definitions)) {
      const [field] = await insert("grida_forms", "attribute", {
        form_id: created.id,
        label: key,
        local_index: Object.keys(fields).length,
        ...definition,
      });
      fields[key] = field;
      await insert("grida_forms", "form_block", {
        form_id: created.id,
        form_page_id: document.id,
        type: "field",
        form_field_id: field.id,
      });
    }
    return {
      id: created.id,
      projectId,
      documentId: document.id,
      fields: fields as Record<keyof Definitions & string, FieldRow>,
    };
  }

  const nativeForm = await form(projectA.id, "native", {
    name: { name: "full_name", type: "text" },
    email: { name: "contact_email", type: "email" },
    file: { name: "attachment", type: "file" },
    choice: { name: "ticket", type: "select" },
    challenge: {
      name: "__gf_customer_email",
      type: "challenge_email",
      required: true,
    },
  });
  const foreignForm = await form(projectB.id, "other", {
    name: { name: "full_name", type: "text" },
    file: { name: "attachment", type: "file" },
    challenge: {
      name: "__gf_customer_email",
      type: "challenge_email",
      required: true,
    },
  });
  const [customerB] = await insert("public", "customer", {
    project_id: projectB.id,
    uuid: randomUUID(),
    email: `other-${run}@example.com`,
    name: "Other tenant customer",
  });
  const b = { ...foreignForm, customer: customerB };
  const directFile = await form(projectA.id, "direct_file", {
    name: { name: "full_name", type: "text" },
    file: { name: "attachment", type: "file" },
  });
  const completionFailureForm = await form(projectA.id, "completion_failure", {
    name: { name: "full_name", type: "text" },
    email: { name: "contact_email", type: "email" },
    challenge: {
      name: "__gf_customer_email",
      type: "challenge_email",
      required: true,
    },
  });
  const completionFailure = {
    ...completionFailureForm,
    email: `receipt-failure-${run}@example.com`,
    provisionalEmail: `receipt-contact-${run}@example.com`,
  };
  await patch("grida_forms", "form", `id=eq.${completionFailure.id}`, {
    notification_respondent_email: {
      enabled: true,
      subject_template: `Forms failure receipt ${run}`,
      body_html_template: "<p>Thanks {{fields.full_name}}</p>",
    },
  });
  await patch("grida_forms", "form", `id=eq.${nativeForm.id}`, {
    notification_respondent_email: {
      enabled: true,
      subject_template: `Forms receipt ${run}`,
      body_html_template: "<p>Thanks {{fields.full_name}}</p>",
    },
  });
  const [option] = await insert("grida_forms", "option", {
    form_id: nativeForm.id,
    form_field_id: nativeForm.fields.choice.id,
    value: "general",
    label: "General admission",
  });
  const [store] = await insert("grida_commerce", "store", {
    project_id: projectA.id,
    name: `Forms fixture ${run}`,
  });
  await insert("grida_forms", "connection_commerce_store", {
    form_id: nativeForm.id,
    project_id: projectA.id,
    store_id: store.id,
  });
  const [item] = await insert("grida_commerce", "inventory_item", {
    store_id: store.id,
    sku: option.id,
    is_negative_level_allowed: false,
  });
  const level = await one(
    "grida_commerce",
    "inventory_level",
    `inventory_item_id=eq.${item.id}`
  );
  await insert("grida_commerce", "inventory_level_commit", {
    inventory_level_id: level.id,
    diff: 2,
    reason: "initialize",
  });
  const a = {
    ...nativeForm,
    email: `verified-${run}@example.com`,
    provisionalEmail: `contact-${run}@example.com`,
    inventory: {
      optionId: option.id,
      itemId: item.id,
      levelId: level.id,
      initial: 2,
    },
  };
  assert.equal(
    (await one("grida_commerce", "inventory_item", `id=eq.${item.id}`))
      .available,
    2
  );

  // A real connected PostgREST target; separate fixture-owned table and grants,
  // same disposable server. This proves adapter/SQL effects, not a second hosted
  // project's network or Auth configuration. No production schema is changed.
  const targetTable = `forms_local_connected_${run}`;
  const multiTargetTable = `forms_local_choices_${run}`;
  assert.match(targetTable, /^forms_local_connected_[a-f0-9]{12}$/);
  assert.match(multiTargetTable, /^forms_local_choices_[a-f0-9]{12}$/);
  await executeSql(`
    CREATE TABLE public.${targetTable} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text NOT NULL, attachment text);
    ALTER TABLE public.${targetTable} ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.${targetTable} FROM PUBLIC, anon, authenticated;
    GRANT ALL ON public.${targetTable} TO service_role;
    CREATE TABLE public.${multiTargetTable} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text NOT NULL, checkboxes text[], toggles text[], stock text[], stock_toggles text[]);
    ALTER TABLE public.${multiTargetTable} ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.${multiTargetTable} FROM PUBLIC, anon, authenticated;
    GRANT ALL ON public.${multiTargetTable} TO service_role;
    NOTIFY pgrst, 'reload schema';
  `);
  await eventually(
    async () =>
      (await request(`/rest/v1/${targetTable}?select=id`, { allowError: true }))
        .ok,
    "fixture target appears in PostgREST schema cache"
  );
  const connectedForm = await form(projectA.id, "connected", {
    name: {
      name: "full_name",
      type: "text",
      data: { internal_fixture: "not-public", password: "fixture-only" },
      reference: {
        type: "x-supabase",
        schema: "public",
        table: targetTable,
        column: "id",
      },
    },
    file: {
      name: "attachment",
      type: "file",
      storage: {
        type: "x-supabase",
        mode: "staged",
        bucket: RESPONSE_BUCKET,
        path: `connected/${run}/{{RECORD.id}}/pixel.png`,
      },
    },
  });
  const schema = {
    type: "object",
    required: ["id", "full_name"],
    properties: {
      id: {
        type: "string",
        format: "uuid",
        default: "gen_random_uuid()",
        description: "Note:\nThis is a Primary Key.<pk/>",
      },
      full_name: { type: "string", format: "text" },
      attachment: { type: "string", format: "text" },
    },
  };
  const multiSchema = {
    type: "object",
    required: ["id", "full_name"],
    properties: {
      id: schema.properties.id,
      full_name: schema.properties.full_name,
      ...Object.fromEntries(
        ["checkboxes", "toggles", "stock", "stock_toggles"].map((name) => [
          name,
          {
            type: "array",
            format: "text[]",
            items: { type: "string", format: "text" },
          },
        ])
      ),
    },
  };
  const [connectionProject] = await insert(
    "grida_x_supabase",
    "supabase_project",
    {
      project_id: projectA.id,
      sb_anon_key: setup.anonKey,
      sb_project_reference_id: `forms-fixture-${run}`,
      sb_project_url: setup.apiUrl,
      sb_public_schema: {
        [targetTable]: schema,
        [multiTargetTable]: multiSchema,
      },
      sb_schema_definitions: {
        public: { [targetTable]: schema, [multiTargetTable]: multiSchema },
      },
      sb_schema_openapi_docs: {},
    }
  );
  const [connectionTable] = await insert("grida_x_supabase", "supabase_table", {
    supabase_project_id: connectionProject.id,
    sb_schema_name: "public",
    sb_table_name: targetTable,
    sb_table_schema: schema,
    sb_postgrest_methods: ["get", "post"],
  });
  // Existing connection-management creation RPC calls secure.fetch_key_id,
  // which assumes a pgsodium.key table absent from the canonical local history.
  // Seed an already-configured connection through Vault itself. The moving
  // operation must still reveal that real Vault secret through its normal RPC.
  // SQL travels only through the runner's private stdin, never argv or logs.
  assert.match(setup.serviceRoleKey, /^[A-Za-z0-9_.-]+$/);
  assert(Number.isSafeInteger(connectionProject.id));
  await executeSql(`
    WITH secret AS (
      SELECT vault.create_secret('${setup.serviceRoleKey}', 'forms_fixture_${run}', 'Disposable Forms fixture') AS id
    )
    UPDATE grida_x_supabase.supabase_project
    SET sb_service_key_id = secret.id FROM secret WHERE supabase_project.id = ${connectionProject.id};
  `);
  await insert("grida_forms", "connection_supabase", {
    form_id: connectedForm.id,
    supabase_project_id: connectionProject.id,
    main_supabase_table_id: connectionTable.id,
  });
  const connected = {
    ...connectedForm,
    targetTable,
    connectionProjectId: connectionProject.id,
  };

  const multiValueForm = await form(projectA.id, "choices", {
    name: { name: "full_name", type: "text" },
    checkboxes: { name: "checkboxes", type: "checkboxes", multiple: false },
    toggles: { name: "toggles", type: "toggle-group", multiple: true },
    stock: { name: "stock", type: "checkboxes", multiple: null },
    stockToggles: {
      name: "stock_toggles",
      type: "toggle-group",
      multiple: true,
    },
  });
  const [multiConnectionTable] = await insert(
    "grida_x_supabase",
    "supabase_table",
    {
      supabase_project_id: connectionProject.id,
      sb_schema_name: "public",
      sb_table_name: multiTargetTable,
      sb_table_schema: multiSchema,
      sb_postgrest_methods: ["get", "post"],
    }
  );
  await insert("grida_forms", "connection_supabase", {
    form_id: multiValueForm.id,
    supabase_project_id: connectionProject.id,
    main_supabase_table_id: multiConnectionTable.id,
  });
  type ChoiceField = "checkboxes" | "toggles" | "stock" | "stockToggles";
  const choiceOptions = {} as Record<
    ChoiceField,
    Database["grida_forms"]["Tables"]["option"]["Row"][]
  >;
  for (const [key, values] of [
    ["checkboxes", ["Research, design", randomUUID()]],
    ["toggles", ["First choice", "Second choice"]],
    ["stock", ["Standard ticket", "Extended ticket"]],
    ["stockToggles", ["Standard toggle ticket", "Extended toggle ticket"]],
  ] as const) {
    choiceOptions[key] = await insert(
      "grida_forms",
      "option",
      values.map((value) => ({
        form_id: multiValueForm.id,
        form_field_id: multiValueForm.fields[key].id,
        value,
        label: value,
      }))
    );
  }
  await insert("grida_forms", "connection_commerce_store", {
    form_id: multiValueForm.id,
    project_id: projectA.id,
    store_id: store.id,
  });
  const choiceInventory: {
    optionId: string;
    itemId: number;
    levelId: number;
  }[] = [];
  for (const option of [
    ...choiceOptions.stock,
    ...choiceOptions.stockToggles,
  ]) {
    const [item] = await insert("grida_commerce", "inventory_item", {
      store_id: store.id,
      sku: option.id,
      is_negative_level_allowed: false,
    });
    const level = await one(
      "grida_commerce",
      "inventory_level",
      `inventory_item_id=eq.${item.id}`
    );
    await insert("grida_commerce", "inventory_level_commit", {
      inventory_level_id: level.id,
      diff: 3,
      reason: "initialize",
    });
    choiceInventory.push({
      optionId: option.id,
      itemId: item.id,
      levelId: level.id,
    });
  }

  const multiValue = {
    ...multiValueForm,
    targetTable: multiTargetTable,
    options: choiceOptions,
    inventory: choiceInventory,
  };

  // CIAM's private challenge table is deliberately absent from PostgREST.
  // Inspect only counters/terminal state through the runner-owned SQL channel;
  // neither OTP hashes/salts nor challenge capabilities enter its output.
  async function otpState(challengeId: string): Promise<OtpState> {
    assert.match(challengeId, /^[a-f0-9-]{36}$/);
    const state: unknown = JSON.parse(
      (
        await executeSql(`
      SELECT json_build_object('attempts', attempt_count, 'consumed', consumed_at IS NOT NULL)
      FROM grida_ciam.customer_otp_challenge WHERE id = '${challengeId}'::uuid;
    `)
      ).trim()
    );
    return state as OtpState;
  }
  async function otpChallengeCount(
    projectId: number,
    email: string
  ): Promise<number> {
    assert(Number.isSafeInteger(projectId));
    assert.match(email, /^[a-z0-9-]+@example\.com$/);
    return Number(
      (
        await executeSql(`
      SELECT count(*) FROM grida_ciam.customer_otp_challenge
      WHERE project_id = ${projectId} AND email = '${email}';
    `)
      ).trim()
    );
  }

  return {
    run,
    a,
    b,
    connected,
    multiValue,
    directFile,
    completionFailure,
    personas,
    projectA,
    projectB,
    request,
    rows,
    one,
    patch,
    otpState,
    otpChallengeCount,
    apiUrl: setup.apiUrl,
    anonKey: setup.anonKey,
    bytes: FILE_BYTES,
    bucket: RESPONSE_BUCKET,
  };
}

export type Fixture = Awaited<ReturnType<typeof createFixtures>>;
