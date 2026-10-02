import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// This overlay belongs only to the runner-owned auth-local stack. It is not a
// migration, base seed, or hosted-project setup command. Teardown destroys the
// owned stack, including committed HTTP writes, object bytes and Vault secrets.
export const FILE_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64"
);
export const RESPONSE_BUCKET = "grida-forms-response";

export async function eventually(check, description, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}`);
}

export function createFixtureClient({ setup }) {
  assert.equal(setup.apiUrl, "http://127.0.0.1:55431");
  assert.equal(typeof setup.serviceRoleKey, "string");

  // Never inherit credentials or follow a redirect. Errors deliberately omit
  // request/response bodies, which can contain fixture access tokens and OTPs.
  async function request(
    path,
    {
      method = "GET",
      body,
      token = setup.serviceRoleKey,
      schema = "public",
      allowError = false,
      headers = {},
    } = {}
  ) {
    assert(path.startsWith("/") && !path.startsWith("//"));
    const url = new URL(path, setup.apiUrl);
    assert.equal(url.origin, setup.apiUrl);
    const options = {
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
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!allowError && !response.ok) {
      throw new Error(
        `Fixture ${method} ${url.pathname} failed (${response.status}, ${data?.code ?? "unknown"})`
      );
    }
    return { status: response.status, ok: response.ok, data };
  }

  async function rows(schema, table, query = "select=*", options = {}) {
    const result = await request(`/rest/v1/${table}?${query}`, {
      schema,
      ...options,
    });
    assert(Array.isArray(result.data), `Expected rows from ${schema}.${table}`);
    return result.data;
  }
  async function insert(schema, table, body) {
    return rows(schema, table, "select=*", { method: "POST", body });
  }
  async function patch(schema, table, query, body) {
    return rows(schema, table, query, { method: "PATCH", body });
  }
  async function one(schema, table, query) {
    const result = await rows(schema, table, query);
    assert.equal(result.length, 1, `Expected one ${schema}.${table} row`);
    return result[0];
  }
  return { request, rows, insert, patch, one };
}

export async function createFixtures({ setup, executeSql }) {
  assert.equal(typeof executeSql, "function");
  const run = randomUUID().replaceAll("-", "").slice(0, 12);
  const { request, rows, insert, patch, one } = createFixtureClient({ setup });
  const personas = {};
  for (const [name, email] of [
    ["insider", "insider@grida.co"],
    ["alice", "alice@acme.com"],
    ["outsider", "random@example.com"],
  ]) {
    const { data } = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      token: setup.anonKey,
      body: { email, password: "password" },
    });
    assert.equal(typeof data.access_token, "string");
    personas[name] = { token: data.access_token, id: data.user.id };
  }
  const seedA = await one(
    "public",
    "project",
    "select=id,organization_id&name=eq.dev"
  );
  const seedB = await one(
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
  const bucket = await request(`/storage/v1/bucket/${RESPONSE_BUCKET}`);
  assert.equal(
    bucket.data.public,
    true,
    "Forms response bucket remains public"
  );

  async function form(projectId, label, definitions) {
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
    const fields = {};
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
    return { id: created.id, projectId, documentId: document.id, fields };
  }

  const a = await form(projectA.id, "native", {
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
  const b = await form(projectB.id, "other", {
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
    email: `other-${run}@example.com`,
    name: "Other tenant customer",
  });
  b.customer = customerB;
  a.email = `verified-${run}@example.com`;
  a.provisionalEmail = `contact-${run}@example.com`;
  const completionFailure = await form(projectA.id, "completion_failure", {
    name: { name: "full_name", type: "text" },
    email: { name: "contact_email", type: "email" },
    challenge: {
      name: "__gf_customer_email",
      type: "challenge_email",
      required: true,
    },
  });
  completionFailure.email = `receipt-failure-${run}@example.com`;
  completionFailure.provisionalEmail = `receipt-contact-${run}@example.com`;
  await patch("grida_forms", "form", `id=eq.${completionFailure.id}`, {
    notification_respondent_email: {
      enabled: true,
      subject_template: `Forms failure receipt ${run}`,
      body_html_template: "<p>Thanks {{fields.full_name}}</p>",
    },
  });
  await patch("grida_forms", "form", `id=eq.${a.id}`, {
    notification_respondent_email: {
      enabled: true,
      subject_template: `Forms receipt ${run}`,
      body_html_template: "<p>Thanks {{fields.full_name}}</p>",
    },
  });
  const [option] = await insert("grida_forms", "option", {
    form_id: a.id,
    form_field_id: a.fields.choice.id,
    value: "general",
    label: "General admission",
  });
  const [store] = await insert("grida_commerce", "store", {
    project_id: projectA.id,
    name: `Forms fixture ${run}`,
  });
  await insert("grida_forms", "connection_commerce_store", {
    form_id: a.id,
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
  a.inventory = {
    optionId: option.id,
    itemId: item.id,
    levelId: level.id,
    initial: 2,
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
  assert.match(targetTable, /^forms_local_connected_[a-f0-9]{12}$/);
  await executeSql(`
    CREATE TABLE public.${targetTable} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text NOT NULL, attachment text);
    ALTER TABLE public.${targetTable} ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.${targetTable} FROM PUBLIC, anon, authenticated;
    GRANT ALL ON public.${targetTable} TO service_role;
    NOTIFY pgrst, 'reload schema';
  `);
  await eventually(
    async () =>
      (await request(`/rest/v1/${targetTable}?select=id`, { allowError: true }))
        .ok,
    "fixture target appears in PostgREST schema cache"
  );
  const connected = await form(projectA.id, "connected", {
    name: {
      name: "full_name",
      type: "text",
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
  const [connectionProject] = await insert(
    "grida_x_supabase",
    "supabase_project",
    {
      project_id: projectA.id,
      sb_anon_key: setup.anonKey,
      sb_project_reference_id: `forms-fixture-${run}`,
      sb_project_url: setup.apiUrl,
      sb_public_schema: { [targetTable]: schema },
      sb_schema_definitions: { public: { [targetTable]: schema } },
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
    form_id: connected.id,
    supabase_project_id: connectionProject.id,
    main_supabase_table_id: connectionTable.id,
  });
  connected.targetTable = targetTable;
  connected.connectionProjectId = connectionProject.id;

  return {
    run,
    a,
    b,
    connected,
    completionFailure,
    personas,
    projectA,
    projectB,
    request,
    rows,
    one,
    patch,
    apiUrl: setup.apiUrl,
    anonKey: setup.anonKey,
    bytes: FILE_BYTES,
    bucket: RESPONSE_BUCKET,
  };
}
