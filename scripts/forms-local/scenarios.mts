import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  createFixtureClient,
  type Fixture,
  type FixtureSetup,
  FILE_BYTES,
  RESPONSE_BUCKET,
} from "./fixtures.mts";
import type { Provider } from "./providers.mts";

type Log = (message: string) => void;
type FormIdentity = { id: string };
interface ScenarioOptions {
  origin: string;
  fixture: Fixture;
  log?: Log;
}
interface RequestOptions {
  method?: string;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
}
interface HttpResult {
  status: number;
  ok: boolean;
  data: unknown;
  headers: Headers;
}
interface Envelope<T> {
  data: T;
  error: unknown;
}
interface SessionData {
  id: string;
  form_id: string;
}
interface SubmissionData {
  id: string;
  customer_id: string | null;
}
interface UploadData {
  signedUrl: string;
  path: string;
  token: string;
}
interface ChallengeState {
  state: string;
  customer_uid: string | null;
  challenge_id: string;
  email: string;
}
interface ChallengeResponse {
  challenge_id: string;
  state: ChallengeState;
}
interface LoadResponse {
  data: {
    title: string;
    is_open: boolean;
    session_id: string;
    fields: { id: string; [key: string]: unknown }[];
    blocks: unknown[];
    tree: unknown;
    required_hidden_fields: unknown;
    default_values: Record<string, unknown>;
    customer_access: { customer: { uid: string } | null };
  };
  error: { code: string; missing_required_hidden_fields?: unknown } | null;
}
interface SessionRow {
  id: string;
  form_id: string;
  customer_id: string | null;
  raw: Record<string, unknown>;
}
interface ResponseRow {
  id: string;
  form_id: string;
  session_id: string | null;
  customer_id: string | null;
  raw: Record<string, unknown>;
  geo: unknown;
  x_ipinfo: unknown;
  platform_powered_by: string;
}
interface ResponseFieldRow {
  response_id: string;
  form_id: string;
  form_field_id: string;
  value: unknown;
  form_field_option_id: string | null;
  form_field_option_ids: string[] | null;
  storage_object_paths: string[];
  challenge_state: ChallengeState;
}
interface ConnectedRow {
  id: string;
  full_name: string;
  attachment: string | null;
  checkboxes: string[];
  toggles: string[];
}
interface ClientProofInput {
  apiOrigin: string;
  storageOrigin: string;
  sdk: { formId: string; sessionId: string; values: Record<string, string> };
  manual: { formId: string; sessionId: string; values: Record<string, string> };
  missingFormId: string;
  file: {
    sessionId: string;
    fieldId: string;
    name: string;
    bytesBase64: string;
  };
  challenge: { sessionId: string; fieldId: string; email: string };
}
interface ClientProofOutput {
  sdk: SubmissionData;
  manual: { completed: boolean };
  denied: { sdk: boolean; manual: boolean };
  file: { path: string; publicUrl: string };
  challenge: {
    challengeId: string;
    state: string;
    invalidVerifyRejected: boolean;
  };
}

// Independent HTTP/SQL outcomes, shared by the pre-move Next artifact and the
// extracted API. No imports of route functions or application validators.
export async function runFormsScenarios({
  origin,
  webOrigin = "http://localhost:3000",
  publicContract = true,
  fixture: f,
  provider,
  log = () => {},
}: ScenarioOptions & {
  webOrigin?: string;
  publicContract?: boolean;
  provider: Provider;
}) {
  const base = new URL(origin);
  assert.equal(base.hostname, "127.0.0.1");
  assert.equal(base.protocol, "http:");
  const web = new URL(webOrigin);
  assert(["127.0.0.1", "localhost"].includes(web.hostname));
  assert.equal(web.protocol, "http:");
  const completed: string[] = [];
  const done = (name: string) => {
    completed.push(name);
    log(`forms: ${name}`);
  };
  const sessionPath = (session: string, field: string) =>
    `/v1/forms/session/${session}/field/${field}`;

  async function request(
    path: string,
    { method = "GET", json, body, headers = {} }: RequestOptions = {}
  ): Promise<HttpResult> {
    const target = new URL(path, base);
    assert.equal(target.origin, base.origin);
    const options: RequestInit = {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        ...(json === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
    };
    const payload = json === undefined ? body : JSON.stringify(json);
    if (payload !== undefined) {
      assert(
        !["GET", "HEAD"].includes(method),
        "Read requests cannot carry a body"
      );
      options.body = payload;
    }
    const response = await fetch(target, options);
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return {
      status: response.status,
      ok: response.ok,
      data,
      headers: response.headers,
    };
  }
  function success<T = unknown>(result: HttpResult, label: string): T {
    assert.equal(
      result.status,
      200,
      `${label}: expected HTTP 200, got ${result.status}`
    );
    assert(result.data !== null, `${label}: expected JSON`);
    return result.data as T;
  }
  function denied(result: HttpResult, label: string) {
    assert(
      [400, 401, 403, 404].includes(result.status),
      `${label}: expected explicit client denial, got ${result.status}`
    );
  }
  async function session(form: FormIdentity) {
    const envelope = success<Envelope<SessionData>>(
      await request(`/v1/forms/${form.id}/session`),
      "create session"
    );
    const data = envelope.data;
    if (publicContract) {
      assert.equal(envelope.error, null);
      assert.deepEqual(Object.keys(data).sort(), ["form_id", "id"]);
    }
    assert.equal(data.form_id, form.id);
    assert.match(data.id, /^[a-f0-9-]{36}$/);
    return data.id;
  }
  const sessionRow = (id: string) =>
    f.one<SessionRow>("grida_forms", "response_session", `id=eq.${id}`);
  const responseRows = (form: FormIdentity) =>
    f.rows<ResponseRow>(
      "grida_forms",
      "response",
      `form_id=eq.${form.id}&order=id`
    );
  const inventory = () =>
    f.one("grida_commerce", "inventory_item", `id=eq.${f.a.inventory.itemId}`);
  function submission(
    sessionId: string | null,
    values: Record<string, string | Blob> = {}
  ) {
    const body = new FormData();
    if (sessionId) body.set("__gf_session", sessionId);
    body.set("__gf_utc_offset", "0");
    for (const [key, value] of Object.entries(values)) body.set(key, value);
    return body;
  }
  const submit = (
    form: FormIdentity,
    sessionId: string | null,
    values: Record<string, string | Blob>,
    headers?: Record<string, string>
  ) =>
    request(`/v1/forms/submit/${form.id}`, {
      method: "POST",
      body: submission(sessionId, values),
      headers,
    });
  const fileDto = (name: string) => ({
    file: { name, size: f.bytes.length, type: "image/png", lastModified: 0 },
  });
  async function uploadBytes(upload: UploadData) {
    const url = new URL(upload.signedUrl);
    assert.equal(url.origin, f.apiUrl, "Signed upload escaped owned Storage");
    const response = await fetch(url, {
      method: "PUT",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "image/png" },
      body: f.bytes,
    });
    assert(
      response.ok,
      `Actual signed byte upload failed (${response.status})`
    );
    await response.arrayBuffer();
  }

  provider.reset();
  // Public Forms session IDs remain the respondent capability. Member JWTs are
  // tested separately against database RLS; these anonymous calls need no login.
  const load = success<LoadResponse>(
    await request(`/v1/forms/${f.a.id}`),
    "load native form"
  );
  assert.equal(load.error, null);
  assert.equal(load.data.title, `Forms baseline native ${f.run}`);
  assert.equal(load.data.is_open, true);
  assert(load.data.fields.some((field) => field.id === f.a.fields.name.id));
  if (publicContract) assertPublicRender(load);
  const aSession = load.data.session_id;
  assert.equal((await sessionRow(aSession)).form_id, f.a.id);
  const bSession = await session(f.b);
  if (publicContract) {
    const identified = success<LoadResponse>(
      await request(
        `/v1/forms/${f.b.id}?${new URLSearchParams({
          __gf_session: bSession,
          __gf_customer_uuid: f.b.customer.uuid!,
        })}`
      ),
      "public customer projection"
    );
    assert.deepEqual(identified.data.customer_access.customer, {
      uid: f.b.customer.uid,
    });
    assertPublicRender(identified);
  }
  denied(await request(`/v1/forms/${randomUUID()}`), "unknown form");
  done("load and real respondent sessions");

  const aFieldPath = sessionPath(aSession, f.a.fields.name.id);
  success(
    await request(aFieldPath, {
      method: "PATCH",
      json: { value: "Saved draft" },
    }),
    "partial save"
  );
  assert.equal(
    (await sessionRow(aSession)).raw[f.a.fields.name.id],
    "Saved draft"
  );
  const rawBefore = (await sessionRow(aSession)).raw;
  for (const [key, value, label] of [
    [f.b.fields.name.id, "Foreign field", "foreign field partial"],
    [
      `__challenge_email__${f.a.fields.challenge.id}`,
      {
        state: "challenge-success",
        customer_uid: f.b.customer.uid,
        email: f.b.customer.email,
      },
      "forged server challenge state",
    ],
    ["__gf_customer_email", f.b.customer.email, "reserved identity key"],
  ] as const) {
    denied(
      await request(sessionPath(aSession, key), {
        method: "PATCH",
        json: { value },
      }),
      label
    );
    assert.deepEqual(
      (await sessionRow(aSession)).raw,
      rawBefore,
      `${label}: raw changed`
    );
  }
  denied(
    await request(sessionPath(randomUUID(), f.a.fields.name.id), {
      method: "PATCH",
      json: { value: "Unknown session" },
    }),
    "unknown session partial"
  );
  assert.equal(
    (
      await request(aFieldPath, {
        method: "PATCH",
        body: "{broken",
        headers: { "Content-Type": "application/json" },
      })
    ).status,
    400,
    "Malformed JSON must be a client error"
  );
  assert.equal((await request(aFieldPath, { method: "DELETE" })).status, 405);
  assert.deepEqual((await sessionRow(aSession)).raw, rawBefore);
  const foreignBefore = await sessionRow(bSession);
  denied(
    await request(`/v1/forms/${f.a.id}?__gf_session=${bSession}`),
    "load cannot rebind foreign session"
  );
  assert.deepEqual(await sessionRow(bSession), foreignBefore);
  assert.equal((await responseRows(f.a)).length, 0);
  assert.equal((await inventory()).available, 2);
  done("partial data and reserved/cross-resource denial");

  const filePath = sessionPath(aSession, f.a.fields.file.id);
  const upload = success<Envelope<UploadData>>(
    await request(`${filePath}/file/upload/signed-url`, {
      method: "POST",
      json: fileDto("pixel.png"),
    }),
    "signed upload"
  );
  assert.equal(upload.error, null);
  assert(upload.data.path.startsWith(`tmp/${aSession}/${f.a.fields.file.id}/`));
  await uploadBytes(upload.data);
  const preview = success<Envelope<{ publicUrl: string }>>(
    await request(
      `${filePath}/file/preview/public-url?${new URLSearchParams({ path: upload.data.path })}`
    ),
    "preview URL"
  );
  const publicUrl = new URL(preview.data.publicUrl);
  assert.equal(publicUrl.origin, f.apiUrl);
  const bytes = await fetch(publicUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(bytes.status, 200);
  assert.deepEqual(
    Buffer.from(await bytes.arrayBuffer()),
    f.bytes,
    "Preview did not return fixture bytes"
  );
  denied(
    await request(
      `${sessionPath(aSession, f.b.fields.file.id)}/file/upload/signed-url`,
      {
        method: "POST",
        json: { file: { name: "foreign.png" } },
      }
    ),
    "foreign field upload"
  );
  denied(
    await request(
      `${sessionPath(aSession, f.b.fields.file.id)}/file/preview/public-url?${new URLSearchParams({ path: upload.data.path })}`
    ),
    "foreign field preview"
  );
  done("actual signed upload and public preview bytes");

  const challengePath = `${sessionPath(aSession, f.a.fields.challenge.id)}/challenge/email`;
  assert.equal(
    success<ChallengeResponse>(
      await request(`${challengePath}/state`),
      "initial challenge"
    ).state.state,
    "idle"
  );
  const deniedBefore = await responseRows(f.a);
  denied(
    await submit(f.a, aSession, {
      full_name: "Unverified",
      ticket: f.a.inventory.optionId,
    }),
    "required challenge"
  );
  assert.deepEqual(await responseRows(f.a), deniedBefore);
  assert.equal((await inventory()).available, 2);
  const started = success<ChallengeResponse>(
    await request(`${challengePath}/start`, {
      method: "POST",
      json: { email: f.a.email },
    }),
    "OTP start"
  );
  assert.equal(started.state.state, "challenge-session-started");
  const email = await provider.awaitEmail({ to: f.a.email });
  assert.match(email.otp!, /^\d{6}$/);
  const wrongOtp = email.otp === "000000" ? "000001" : "000000";
  denied(
    await request(`${challengePath}/verify`, {
      method: "POST",
      json: { challenge_id: started.challenge_id, otp: wrongOtp },
    }),
    "wrong OTP"
  );
  assert.equal((await sessionRow(aSession)).customer_id, null);
  denied(
    await request(
      `${sessionPath(aSession, f.b.fields.challenge.id)}/challenge/email/verify`,
      {
        method: "POST",
        json: { challenge_id: started.challenge_id, otp: email.otp },
      }
    ),
    "foreign challenge field"
  );
  const verified = success<ChallengeResponse>(
    await request(`${challengePath}/verify`, {
      method: "POST",
      json: { challenge_id: started.challenge_id, otp: email.otp },
    }),
    "OTP verify"
  );
  assert.equal(verified.state.state, "challenge-success");
  const customerId = verified.state.customer_uid;
  assert.equal((await sessionRow(aSession)).customer_id, customerId);
  const customer = await f.one("public", "customer", `uid=eq.${customerId}`);
  assert.equal(customer.project_id, f.projectA.id);
  assert.equal(customer.email, f.a.email);
  assert.equal(customer.is_email_verified, true);
  assert.equal(
    success<ChallengeResponse>(
      await request(`${challengePath}/state`),
      "verified state"
    ).state.state,
    "challenge-success"
  );
  done("real OTP challenge, verified customer and cross-field denial");

  const foreignUploadSession = await session(f.a);
  const foreignUpload = success<Envelope<UploadData>>(
    await request(
      `${sessionPath(foreignUploadSession, f.a.fields.file.id)}/file/upload/signed-url`,
      {
        method: "PUT",
        json: fileDto("other-session.png"),
      }
    ),
    "unique staged upload"
  ).data;
  assert(
    foreignUpload.path.startsWith(
      `tmp/${foreignUploadSession}/${f.a.fields.file.id}/`
    )
  );
  await uploadBytes(foreignUpload);
  const foreignFileAttempt = await submit(f.a, aSession, {
    full_name: "Wrong file",
    __gf_customer_email: f.a.email,
    attachment: foreignUpload.path,
    ticket: f.a.inventory.optionId,
  });
  assert.equal(
    foreignFileAttempt.status,
    400,
    "Foreign session staged file must fail before writes"
  );
  assert.equal((await responseRows(f.a)).length, 0);
  assert.equal((await inventory()).available, 2);
  const foreignObject = await fetch(
    `${f.apiUrl}/storage/v1/object/public/${f.bucket}/${foreignUpload.path}`,
    {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    }
  );
  assert.equal(foreignObject.status, 200);
  assert.deepEqual(Buffer.from(await foreignObject.arrayBuffer()), f.bytes);
  done("cross-session file denial preserves the original bytes");

  denied(
    await submit(f.a, bSession, {
      full_name: "Wrong session",
      ticket: f.a.inventory.optionId,
    }),
    "submit with foreign session"
  );
  assert.deepEqual(await sessionRow(bSession), foreignBefore);
  assert.equal((await responseRows(f.a)).length, 0);
  assert.equal((await inventory()).available, 2);

  const accepted = success<Envelope<SubmissionData>>(
    await submit(f.a, aSession, {
      full_name: "Ada Fixture",
      contact_email: f.a.provisionalEmail,
      __gf_customer_email: f.a.email,
      attachment: upload.data.path,
      ticket: f.a.inventory.optionId,
    }),
    "multipart submission"
  );
  if (publicContract) assertPublicSubmission(accepted);
  assert(accepted.data?.id, "Submit did not return persisted response ID");
  const response = await f.one<ResponseRow>(
    "grida_forms",
    "response",
    `id=eq.${accepted.data.id}`
  );
  assert.equal(response.form_id, f.a.id);
  assert.equal(response.session_id, aSession);
  assert.equal(response.customer_id, customerId);
  assert.equal(response.raw.full_name, "Ada Fixture");
  assert.equal((await responseRows(f.a)).length, 1);
  assert.equal((await responseRows(f.b)).length, 0);
  const fields = await f.rows<ResponseFieldRow>(
    "grida_forms",
    "response_field",
    `response_id=eq.${response.id}`
  );
  assert.equal(fields.length, Object.keys(f.a.fields).length);
  assert(fields.every((field) => field.form_id === f.a.id));
  const textField = fields.find(
    (field) => field.form_field_id === f.a.fields.name.id
  )!;
  assert.equal(textField.value, "Ada Fixture");
  const optionField = fields.find(
    (field) => field.form_field_id === f.a.fields.choice.id
  )!;
  assert.equal(optionField.form_field_option_id, f.a.inventory.optionId);
  const challengeField = fields.find(
    (field) => field.form_field_id === f.a.fields.challenge.id
  )!;
  assert.equal(challengeField.challenge_state.state, "challenge-success");
  assert.equal(challengeField.challenge_state.customer_uid, customerId);
  const fileField = fields.find(
    (field) => field.form_field_id === f.a.fields.file.id
  )!;
  assert.equal(fileField.storage_object_paths.length, 1);
  const committedPath = fileField.storage_object_paths[0];
  assert(
    committedPath.startsWith(`response/${response.id}/${f.a.fields.file.id}/`)
  );
  const committed = await fetch(
    `${f.apiUrl}/storage/v1/object/public/${f.bucket}/${committedPath}`,
    {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    }
  );
  assert.equal(committed.status, 200);
  assert.deepEqual(
    Buffer.from(await committed.arrayBuffer()),
    f.bytes,
    "Committed bytes changed"
  );
  const moved = await fetch(publicUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  assert.notEqual(moved.status, 200, "Staged object was not moved");
  await moved.arrayBuffer();
  assert.equal((await inventory()).available, 1);
  const commits = await f.rows(
    "grida_commerce",
    "inventory_level_commit",
    `inventory_level_id=eq.${f.a.inventory.levelId}&reason=eq.order`
  );
  assert.equal(commits.length, 1);
  assert.equal(commits[0].diff, -1);
  // These reads happen immediately after HTTP success: required completion
  // cannot be detached work merely scheduled by the response handler.
  assert.equal(
    (await sessionRow(aSession)).raw[f.a.fields.name.id],
    "Ada Fixture"
  );
  const indexed = await f.one("public", "customer", `uid=eq.${customerId}`);
  assert(indexed.email_provisional.includes(f.a.provisionalEmail));
  assert(indexed.email_provisional.includes(f.a.email));
  assert(
    provider.emails.some((mail) => mail.subject === `Forms receipt ${f.run}`),
    "Receipt provider was not invoked"
  );
  done(
    "persisted response, customer/index completion, inventory and committed bytes"
  );

  for (const hook of [
    "clearsession",
    "postindexing",
    "notification-respondent-email",
  ]) {
    denied(
      await request(`/v1/forms/submit/${f.a.id}/hooks/${hook}`, {
        method: "POST",
        json: { response_id: response.id, session_id: aSession },
      }),
      `unauthenticated ${hook}`
    );
  }
  assert.equal((await responseRows(f.a)).length, 1);
  assert.equal((await inventory()).available, 1);
  done("completion commands are not anonymous public capabilities");

  for (const [name, expected] of [
    ["insider", [f.a.id]],
    ["alice", []],
    ["outsider", []],
  ] as const) {
    const visible = await f.rows(
      "grida_forms",
      "form",
      `id=eq.${f.a.id}&select=id`,
      { token: f.personas[name].token }
    );
    assert.deepEqual(
      visible.map((row) => row.id),
      expected,
      `${name} Forms RLS`
    );
    const responses = await f.rows<ResponseRow>(
      "grida_forms",
      "response",
      `id=eq.${response.id}&select=id`,
      { token: f.personas[name].token }
    );
    assert.deepEqual(
      responses.map((row) => row.id),
      name === "insider" ? [response.id] : [],
      `${name} response RLS`
    );
    const write = await f.request(
      "/rest/v1/rpc/set_response_session_field_value",
      {
        schema: "grida_forms",
        method: "POST",
        token: f.personas[name].token,
        allowError: true,
        body: { session_id: aSession, key: "forged", value: true },
      }
    );
    assert.equal(
      write.ok,
      false,
      `${name} cannot bypass HTTP through partial-write RPC`
    );
  }
  const anon = await f.request(`/rest/v1/response?form_id=eq.${f.a.id}`, {
    schema: "grida_forms",
    token: f.anonKey,
    allowError: true,
  });
  assert.equal(anon.ok, false, "Anonymous database response read must fail");
  assert.equal((await sessionRow(aSession)).raw.forged, undefined);
  done("real member, other-tenant, outsider and anonymous database policies");

  const connectedSession = await session(f.connected);
  if (publicContract) {
    const connectedLoad = success<LoadResponse>(
      await request(
        `/v1/forms/${f.connected.id}?__gf_session=${connectedSession}`
      ),
      "connected public projection"
    );
    assertPublicRender(connectedLoad);
    assert(connectedLoad.data.blocks.length > 0);
    assert(
      connectedLoad.data.fields.some(
        (field) => field.id === f.connected.fields.file.id
      )
    );
  }
  const meta = success<{ meta: unknown }>(
    await request(
      `${sessionPath(connectedSession, f.connected.fields.name.id)}/search/meta`
    ),
    "reference metadata"
  );
  assert.deepEqual(meta.meta, {
    provider: "x-supabase",
    supabase_project_id: f.connected.connectionProjectId,
    schema_name: "public",
    referenced_table: f.connected.targetTable,
    referenced_column: "id",
  });
  denied(
    await request(
      `${sessionPath(connectedSession, f.b.fields.name.id)}/search/meta`
    ),
    "foreign reference metadata"
  );
  const connectedUpload = success<Envelope<UploadData>>(
    await request(
      `${sessionPath(connectedSession, f.connected.fields.file.id)}/file/upload/signed-url`,
      {
        method: "PUT",
        json: fileDto("connected.png"),
      }
    ),
    "connected staged upload"
  ).data;
  await uploadBytes(connectedUpload);
  const connectedResult = success<Envelope<SubmissionData>>(
    await submit(f.connected, connectedSession, {
      full_name: "Connected Fixture",
      attachment: connectedUpload.path,
    }),
    "connected submission"
  );
  if (publicContract) assertPublicSubmission(connectedResult);
  assert(connectedResult.data?.id);
  const connectedRows = await f.rows<ConnectedRow>(
    "public",
    f.connected.targetTable
  );
  assert.equal(connectedRows.length, 1);
  assert.equal(connectedRows[0].full_name, "Connected Fixture");
  assert.match(connectedRows[0].id, /^[a-f0-9-]{36}$/);
  assert.equal(
    connectedRows[0].attachment,
    `connected/${f.run}/${connectedRows[0].id}/pixel.png`,
    "Connected post-upload UPDATE did not persist its rendered path"
  );
  const connectedObject = await fetch(
    `${f.apiUrl}/storage/v1/object/public/${f.bucket}/${connectedRows[0].attachment}`,
    {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    }
  );
  assert.equal(connectedObject.status, 200);
  assert.deepEqual(Buffer.from(await connectedObject.arrayBuffer()), f.bytes);
  assert.equal((await responseRows(f.connected)).length, 1);
  assert.equal((await responseRows(f.b)).length, 0);
  done("connected adapter with real Vault credential and PostgREST target");

  const duplicateSession = await session(f.connected);
  const conflicting = new URLSearchParams({ __gf_session: duplicateSession });
  conflicting.append("full_name", "First value");
  conflicting.append("full_name", "Conflicting value");
  assert.equal(
    (await request(`/v1/forms/submit/${f.connected.id}?${conflicting}`)).status,
    400
  );
  assert.equal(
    (await f.rows<ConnectedRow>("public", f.connected.targetTable)).length,
    1
  );
  assert.equal((await responseRows(f.connected)).length, 1);
  const identical = new URLSearchParams({ __gf_session: duplicateSession });
  identical.append("full_name", "GET Fixture");
  identical.append("full_name", "GET Fixture");
  const getResult = success<Envelope<SubmissionData>>(
    await request(`/v1/forms/submit/${f.connected.id}?${identical}`),
    "GET submit with coherent duplicates"
  );
  if (publicContract) assertPublicSubmission(getResult);
  assert.equal(
    (
      await f.one<ResponseRow>(
        "grida_forms",
        "response",
        `id=eq.${getResult.data.id}`
      )
    ).raw.full_name,
    "GET Fixture"
  );
  assert.equal(
    (
      await f.rows(
        "public",
        f.connected.targetTable,
        "full_name=eq.GET%20Fixture"
      )
    ).length,
    1
  );
  const htmlSession = await session(f.connected);
  const html = await submit(
    f.connected,
    htmlSession,
    { full_name: "HTML Fixture" },
    { Accept: "text/html" }
  );
  assert.equal(html.status, 302);
  const destination = new URL(html.headers.get("location")!);
  assert.equal(
    destination.origin,
    web.origin,
    "Receipt navigation escaped the configured fixture web origin"
  );
  assert(destination.pathname.includes(f.connected.id));
  assert(destination.searchParams.get("rid"));
  assert.equal(
    (await f.rows<ConnectedRow>("public", f.connected.targetTable)).length,
    3
  );
  assert.equal((await responseRows(f.connected)).length, 3);
  done("GET duplicate policy and native HTML redirect transport");

  await f.patch("grida_forms", "form", `id=eq.${f.connected.id}`, {
    is_force_closed: true,
  });
  const closed = success<LoadResponse>(
    await request(`/v1/forms/${f.connected.id}`),
    "closed load"
  );
  assert.equal(closed.data.is_open, false);
  assert.equal(closed.error!.code, "FORM_FORCE_CLOSED");
  const closedSubmit = await submit(f.connected, closed.data.session_id, {
    full_name: "Closed Fixture",
  });
  assert.equal(closedSubmit.status, 403);
  assert.equal(
    (closedSubmit.data as { error: unknown }).error,
    "FORM_CLOSED_WHILE_RESPONDING"
  );
  assert.equal(
    (await f.rows<ConnectedRow>("public", f.connected.targetTable)).length,
    3
  );
  assert.equal((await responseRows(f.connected)).length, 3);
  await f.patch("grida_forms", "form", `id=eq.${f.connected.id}`, {
    is_force_closed: false,
  });
  await f.rows("grida_commerce", "inventory_level_commit", "select=*", {
    method: "POST",
    body: {
      inventory_level_id: f.a.inventory.levelId,
      diff: -1,
      reason: "admin",
    },
  });
  assert.equal((await inventory()).available, 0);
  const soldOut = success<LoadResponse>(
    await request(`/v1/forms/${f.a.id}`),
    "sold-out load"
  );
  assert.equal(soldOut.data.is_open, false);
  assert.equal(soldOut.error!.code, "FORM_SOLD_OUT");
  const soldOutChallenge = `${sessionPath(soldOut.data.session_id, f.a.fields.challenge.id)}/challenge/email`;
  const soldOutStarted = success<ChallengeResponse>(
    await request(`${soldOutChallenge}/start`, {
      method: "POST",
      json: { email: f.a.email },
    }),
    "sold-out OTP start"
  );
  const soldOutMail = await provider.awaitEmail({ to: f.a.email });
  success(
    await request(`${soldOutChallenge}/verify`, {
      method: "POST",
      json: { challenge_id: soldOutStarted.challenge_id, otp: soldOutMail.otp },
    }),
    "sold-out OTP verify"
  );
  const soldOutSubmit = await submit(f.a, soldOut.data.session_id, {
    full_name: "Sold out",
    __gf_customer_email: f.a.email,
    ticket: f.a.inventory.optionId,
  });
  assert.equal(soldOutSubmit.status, 403);
  assert.equal(
    (soldOutSubmit.data as { error: unknown }).error,
    "FORM_SOLD_OUT"
  );
  assert.equal((await responseRows(f.a)).length, 1);
  assert.equal((await inventory()).available, 0);
  done("closed and sold-out access prevents retained writes");

  // Delivery is currently best effort. A provider refusal does not verify an
  // email or submit a response; do not invent delivery guarantees or retries.
  const failedSession = await session(f.b);
  provider.failEmails(true);
  try {
    const failure = await request(
      `${sessionPath(failedSession, f.b.fields.challenge.id)}/challenge/email/start`,
      {
        method: "POST",
        json: { email: `undelivered-${f.run}@example.com` },
      }
    );
    assert.equal(
      failure.status,
      200,
      "Current OTP delivery contract is best effort"
    );
    assert.equal((await sessionRow(failedSession)).customer_id, null);
    assert.equal((await responseRows(f.b)).length, 0);
    const unverified = await f.one(
      "public",
      "customer",
      `project_id=eq.${f.projectB.id}&email=eq.undelivered-${f.run}@example.com`
    );
    assert.equal(unverified.is_email_verified, false);
  } finally {
    provider.failEmails(false);
  }
  done("email provider refusal cannot create verified authority");

  // A failure after the write is deliberately different from admission denial.
  // The caller sends once; inspect accepted state instead of retrying elsewhere.
  const completionForm = f.completionFailure;
  const completionSession = await session(completionForm);
  const completionChallenge = `${sessionPath(completionSession, completionForm.fields.challenge.id)}/challenge/email`;
  const completionStarted = success<ChallengeResponse>(
    await request(`${completionChallenge}/start`, {
      method: "POST",
      json: { email: completionForm.email },
    }),
    "completion-failure OTP start"
  );
  const completionMail = await provider.awaitEmail({
    to: completionForm.email,
  });
  const completionVerified = success<ChallengeResponse>(
    await request(`${completionChallenge}/verify`, {
      method: "POST",
      json: {
        challenge_id: completionStarted.challenge_id,
        otp: completionMail.otp,
      },
    }),
    "completion-failure OTP verify"
  );
  assert.equal((await responseRows(completionForm)).length, 0);
  const providerCallsBefore = provider.calls.length;
  provider.failEmails(true);
  try {
    const failedCompletion = await submit(completionForm, completionSession, {
      full_name: "Accepted before receipt failure",
      contact_email: completionForm.provisionalEmail,
      __gf_customer_email: completionForm.email,
    });
    assert.equal(
      failedCompletion.status,
      500,
      "Required completion failure must not report success"
    );
  } finally {
    provider.failEmails(false);
  }
  const retained = await responseRows(completionForm);
  assert.equal(
    retained.length,
    1,
    "The committed response survives receipt failure without replay"
  );
  assert.equal(retained[0].session_id, completionSession);
  assert.equal(retained[0].customer_id, completionVerified.state.customer_uid);
  assert.equal(retained[0].raw.full_name, "Accepted before receipt failure");
  assert.equal(
    (await sessionRow(completionSession)).raw[completionForm.fields.name.id],
    "Accepted before receipt failure"
  );
  const retainedFields = await f.rows<ResponseFieldRow>(
    "grida_forms",
    "response_field",
    `response_id=eq.${retained[0].id}`
  );
  assert.equal(retainedFields.length, 3);
  const retainedCustomer = await f.one(
    "public",
    "customer",
    `uid=eq.${retained[0].customer_id}`
  );
  assert(
    retainedCustomer.email_provisional.includes(completionForm.provisionalEmail)
  );
  assert(retainedCustomer.email_provisional.includes(completionForm.email));
  assert.equal(
    provider.calls
      .slice(providerCallsBefore)
      .filter((call) => call.path === "/resend/emails").length,
    1
  );
  assert(
    !provider.emails.some(
      (mail) => mail.subject === `Forms failure receipt ${f.run}`
    )
  );
  done("post-commit receipt failure preserves accepted state without replay");

  // The staged-path cases above do not exercise multipart File parsing. Send
  // actual bytes in one native submission and observe the resulting object.
  const directSession = await session(f.directFile);
  const directAccepted = success<Envelope<SubmissionData>>(
    await submit(f.directFile, directSession, {
      full_name: "Direct multipart bytes",
      attachment: new File([f.bytes], "direct.png", { type: "image/png" }),
    }),
    "direct multipart file submission"
  );
  if (publicContract) assertPublicSubmission(directAccepted);
  const directResponse = await f.one<ResponseRow>(
    "grida_forms",
    "response",
    `id=eq.${directAccepted.data.id}`
  );
  assert.equal(directResponse.form_id, f.directFile.id);
  assert.equal(directResponse.session_id, directSession);
  assert.equal(directResponse.raw.full_name, "Direct multipart bytes");
  assert.equal((await responseRows(f.directFile)).length, 1);
  const directFileField = await f.one<ResponseFieldRow>(
    "grida_forms",
    "response_field",
    `response_id=eq.${directResponse.id}&form_field_id=eq.${f.directFile.fields.file.id}`
  );
  assert.deepEqual(directFileField.storage_object_paths, [
    `response/${directResponse.id}/${f.directFile.fields.file.id}/direct.png`,
  ]);
  const directBytes = await fetch(
    `${f.apiUrl}/storage/v1/object/public/${f.bucket}/${directFileField.storage_object_paths[0]}`,
    { redirect: "error", signal: AbortSignal.timeout(15_000) }
  );
  assert.equal(directBytes.status, 200);
  assert.deepEqual(Buffer.from(await directBytes.arrayBuffer()), f.bytes);
  assert.equal(
    (await sessionRow(directSession)).raw[f.directFile.fields.name.id],
    "Direct multipart bytes"
  );
  done("direct multipart File stores actual bytes");

  // Emulate platform metadata at the actual HTTP boundary. The deployment
  // region differs from the visitor subdivision; it must not become geo.region.
  const vercelHeaders = {
    "x-real-ip": "203.0.113.42",
    "x-vercel-id": "iad1::fixture",
    "x-vercel-ip-city": encodeURIComponent("서울"),
    "x-vercel-ip-country": "KR",
    "x-vercel-ip-country-region": "11",
    "x-vercel-ip-latitude": "37.5665",
    "x-vercel-ip-longitude": "126.9780",
  };
  const geoCases: {
    name: string;
    headers: Record<string, string>;
    geo: Record<string, string> | null;
    platform: string;
  }[] = [
    {
      name: "Vercel visitor metadata",
      headers: vercelHeaders,
      geo: {
        city: "서울",
        country: "KR",
        region: "11",
        latitude: "37.5665",
        longitude: "126.9780",
      },
      platform: "web_client",
    },
    {
      name: "Vercel country only",
      headers: {
        "x-real-ip": "203.0.113.42",
        "x-vercel-ip-country": "JP",
        "x-vercel-id": "iad1::fixture",
      },
      geo: { country: "JP" },
      platform: "web_client",
    },
    {
      name: "Missing visitor metadata",
      headers: { "x-real-ip": "203.0.113.42", "x-vercel-id": "iad1::fixture" },
      geo: null,
      platform: "web_client",
    },
    {
      name: "Simulator override",
      headers: {
        ...vercelHeaders,
        "x-gf-simulator": "true",
        "x-gf-geo-city": "Osaka",
        "x-gf-geo-country": "JP",
        "x-gf-geo-region": "27",
        "x-gf-geo-latitude": "34.6937",
        "x-gf-geo-longitude": "135.5023",
      },
      geo: {
        city: "Osaka",
        country: "JP",
        region: "27",
        latitude: "34.6937",
        longitude: "135.5023",
      },
      platform: "simulator",
    },
  ];
  const providerCallsBeforeGeo = provider.calls.length;
  for (const scenario of geoCases) {
    const geoSession = await session(f.directFile);
    const accepted = success<Envelope<SubmissionData>>(
      await submit(
        f.directFile,
        geoSession,
        { full_name: scenario.name },
        scenario.headers
      ),
      scenario.name
    );
    if (publicContract) assertPublicSubmission(accepted);
    const persisted = await f.one<ResponseRow>(
      "grida_forms",
      "response",
      `id=eq.${accepted.data.id}`
    );
    assert.equal(persisted.form_id, f.directFile.id);
    assert.equal(persisted.session_id, geoSession);
    assert.equal(persisted.raw.full_name, scenario.name);
    assert.deepEqual(
      persisted.geo,
      scenario.geo,
      `${scenario.name}: persisted geo differs`
    );
    assert.equal(persisted.x_ipinfo, null);
    assert.equal(persisted.platform_powered_by, scenario.platform);
  }
  assert.equal(
    provider.calls.length,
    providerCallsBeforeGeo,
    "Geo cases must not call a provider"
  );
  assert.equal((await responseRows(f.directFile)).length, 1 + geoCases.length);
  done(
    "Vercel geo, missing metadata and simulator overrides persist without lookup"
  );

  // Real repeated multipart and query values must agree across all persisted
  // representations. Checkbox values are literals (including commas and UUID
  // syntax); toggle values are option IDs, repeated or packed by the web input.
  const choices = f.multiValue;
  const checkboxValues = choices.options.checkboxes.map(
    (option) => option.value
  );
  const checkboxIds = choices.options.checkboxes.map((option) => option.id);
  const toggleValues = choices.options.toggles.map((option) => option.value);
  const toggleIds = choices.options.toggles.map((option) => option.id);
  for (const [method, packed] of [
    ["POST", false],
    ["POST", true],
    ["GET", false],
    ["GET", true],
  ]) {
    const label = `${method} ${packed ? "packed" : "repeated"} choices`;
    const choiceSession = await session(choices);
    const body = method === "POST" ? new FormData() : new URLSearchParams();
    body.set("__gf_session", choiceSession);
    body.set("full_name", label);
    for (const value of checkboxValues) body.append("checkboxes", value);
    for (const value of packed ? [toggleIds.join(",")] : toggleIds)
      body.append("toggles", value);
    const result = success<Envelope<SubmissionData>>(
      method === "POST"
        ? await request(`/v1/forms/submit/${choices.id}`, { method, body })
        : await request(`/v1/forms/submit/${choices.id}?${body}`),
      label
    );
    if (publicContract) assertPublicSubmission(result);
    const response = await f.one<ResponseRow>(
      "grida_forms",
      "response",
      `id=eq.${result.data.id}`
    );
    assert.equal(response.form_id, choices.id);
    assert.equal(response.session_id, choiceSession);
    assert.deepEqual(
      response.raw.checkboxes,
      checkboxValues,
      `${label}: raw checkbox literals`
    );
    assert.deepEqual(
      response.raw.toggles,
      toggleIds,
      `${label}: raw toggle references`
    );
    const fields = await f.rows<ResponseFieldRow>(
      "grida_forms",
      "response_field",
      `response_id=eq.${response.id}`
    );
    for (const [key, values, ids] of [
      ["checkboxes", checkboxValues, checkboxIds],
      ["toggles", toggleValues, toggleIds],
    ] as const) {
      const field = fields.find(
        (entry) => entry.form_field_id === choices.fields[key].id
      );
      assert(field, `${label}: persisted ${key} field is missing`);
      assert.deepEqual(field.value, values, `${label}: ${key} values`);
      assert.deepEqual(
        field.form_field_option_ids,
        ids,
        `${label}: ${key} identities`
      );
      assert.equal(field.form_field_option_id, null);
    }
    const target = await f.one(
      "public",
      choices.targetTable,
      `full_name=eq.${encodeURIComponent(label)}`
    );
    assert.deepEqual(
      target.checkboxes,
      checkboxValues,
      `${label}: connected text[] checkbox values`
    );
    assert.deepEqual(
      target.toggles,
      toggleValues,
      `${label}: connected text[] toggle values`
    );
    const savedSession = await sessionRow(choiceSession);
    assert.deepEqual(
      savedSession.raw[choices.fields.checkboxes.id],
      checkboxValues
    );
    assert.deepEqual(savedSession.raw[choices.fields.toggles.id], toggleIds);
  }
  done(
    "repeated checkbox and repeated/packed toggle values persist through multipart and GET"
  );

  const inventoryBeforeChoices = await Promise.all(
    choices.inventory.map((item) =>
      f.one("grida_commerce", "inventory_item", `id=eq.${item.itemId}`)
    )
  );
  const responsesBeforeChoices = await responseRows(choices);
  const targetsBeforeChoices = await f.rows("public", choices.targetTable);
  for (const [label, method, values] of [
    [
      "conflicting multipart scalar",
      "POST",
      [
        ["full_name", "First"],
        ["full_name", "Second"],
      ],
    ],
    [
      "multiple checkbox inventory options",
      "POST",
      choices.options.stock.map((option) => ["stock", option.value]),
    ],
    [
      "repeated toggle inventory options",
      "GET",
      choices.options.stockToggles.map((option) => [
        "stock_toggles",
        option.id,
      ]),
    ],
    [
      "packed toggle inventory options",
      "POST",
      [
        [
          "stock_toggles",
          choices.options.stockToggles.map((option) => option.id).join(","),
        ],
      ],
    ],
  ] satisfies [string, "GET" | "POST", [string, string][]][]) {
    const choiceSession = await session(choices);
    const beforeSession = await sessionRow(choiceSession);
    const customerUuid = randomUUID();
    const body = method === "POST" ? new FormData() : new URLSearchParams();
    body.set("__gf_session", choiceSession);
    body.set("__gf_customer_uuid", customerUuid);
    if (label !== "conflicting multipart scalar") body.set("full_name", label);
    for (const [name, value] of values) body.append(name, value);
    const result =
      method === "POST"
        ? await request(`/v1/forms/submit/${choices.id}`, { method, body })
        : await request(`/v1/forms/submit/${choices.id}?${body}`);
    assert.equal(result.status, 400, `${label}: expected safe client denial`);
    assert.deepEqual(
      await sessionRow(choiceSession),
      beforeSession,
      `${label}: session changed`
    );
    assert.deepEqual(
      await f.rows("public", "customer", `uuid=eq.${customerUuid}`),
      [],
      `${label}: customer was created`
    );
    assert.deepEqual(
      await responseRows(choices),
      responsesBeforeChoices,
      `${label}: response was written`
    );
    assert.deepEqual(
      await f.rows("public", choices.targetTable),
      targetsBeforeChoices,
      `${label}: connected target changed`
    );
    assert.deepEqual(
      await Promise.all(
        choices.inventory.map((item) =>
          f.one("grida_commerce", "inventory_item", `id=eq.${item.itemId}`)
        )
      ),
      inventoryBeforeChoices,
      `${label}: inventory changed`
    );
  }
  done(
    "ambiguous scalar and unsupported multiple inventory selections deny before writes"
  );

  // Final observed counts, without claiming exactly-once behavior or proving
  // the absence of work after this bounded run.
  assert.equal((await responseRows(f.a)).length, 1);
  assert.equal((await responseRows(f.b)).length, 0);
  const otherCustomer = await f.one(
    "public",
    "customer",
    `uid=eq.${f.b.customer.uid}`
  );
  assert.equal(otherCustomer.email, f.b.customer.email);
  assert.equal(otherCustomer.project_id, f.projectB.id);
  return {
    scenarios: completed,
    count: completed.length,
    outcomes: {
      nativeResponses: 1,
      connectedRows: 3,
      acceptedBeforeReceiptFailure: 1,
      directMultipartResponses: 1,
      geoResponses: geoCases.length,
      multiValueResponses: 4,
      foreignResponses: 0,
      inventoryConsumed: 1,
      actualStorageBytes: f.bytes.length,
    },
  };
}

function carryoverHttp(origin: string) {
  const base = new URL(origin);
  assert.equal(base.protocol, "http:");
  assert.equal(base.hostname, "127.0.0.1");
  return async <T,>(
    path: string,
    { method = "GET", json, body }: RequestOptions = {}
  ): Promise<T> => {
    const url = new URL(path, base);
    assert.equal(url.origin, base.origin);
    const options: RequestInit = {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        ...(json === undefined ? {} : { "Content-Type": "application/json" }),
      },
    };
    const payload = json === undefined ? body : JSON.stringify(json);
    if (payload !== undefined) {
      assert(!["GET", "HEAD"].includes(method));
      options.body = payload;
    }
    const response = await fetch(url, options);
    assert.equal(
      response.status,
      200,
      `Carryover ${method} ${url.pathname} failed (${response.status})`
    );
    return response.json();
  };
}

function assertPublicSubmission(envelope: Envelope<SubmissionData>) {
  assert.equal(envelope.error, null);
  assert.deepEqual(Object.keys(envelope.data).sort(), ["customer_id", "id"]);
  assert.equal(typeof envelope.data.id, "string");
  assert(
    envelope.data.customer_id === null ||
      typeof envelope.data.customer_id === "string"
  );
  assert.equal(Object.hasOwn(envelope, "raw"), false);
  assert.equal(Object.hasOwn(envelope, "response_field"), false);
}

function assertPublicRender(envelope: LoadResponse) {
  // Deliberately independent of the production projector. Walk fields and both
  // render representations, including nested options, data and section children.
  const internal = new Set([
    "storage",
    "reference",
    "connection",
    "connection_id",
    "project_id",
    "form_id",
    "form_field_id",
    "form_page_id",
    "created_at",
    "updated_at",
    "supabase_project_id",
    "sb_service_key_id",
    "sb_anon_key",
    "password",
    "service_role_key",
    "internal_fixture",
  ]);
  function walk(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(walk);
    for (const [key, child] of Object.entries(value)) {
      assert(!internal.has(key), `Public render contains internal key: ${key}`);
      walk(child);
    }
  }
  for (const key of [
    "fields",
    "required_hidden_fields",
    "blocks",
    "tree",
  ] as const) {
    walk(envelope.data[key]);
  }
  walk(envelope.error?.missing_required_hidden_fields);
}

// The returned session ID is a respondent capability. Keep this metadata in the
// owned stack's private directory; do not put it in the safe execution report.
export async function prepareCarryover({
  origin,
  fixture: f,
  log = () => {},
}: ScenarioOptions) {
  const request = carryoverHttp(origin);
  const form = f.connected;
  const { data: session } = await request<Envelope<SessionData>>(
    `/v1/forms/${form.id}/session`
  );
  assert.equal(session.form_id, form.id);
  const draft = "Carryover draft";
  await request(
    `/v1/forms/session/${session.id}/field/${form.fields.name.id}`,
    {
      method: "PATCH",
      json: { value: draft },
    }
  );
  const { data: upload } = await request<Envelope<UploadData>>(
    `/v1/forms/session/${session.id}/field/${form.fields.file.id}/file/upload/signed-url`,
    {
      method: "PUT",
      json: {
        file: {
          name: "carryover.png",
          size: f.bytes.length,
          type: "image/png",
          lastModified: 0,
        },
      },
    }
  );
  const url = new URL(upload.signedUrl);
  assert.equal(url.origin, f.apiUrl);
  assert(upload.path.startsWith(`tmp/${session.id}/${form.fields.file.id}/`));
  const uploaded = await fetch(url, {
    method: "PUT",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "image/png" },
    body: f.bytes,
  });
  assert(uploaded.ok, "Carryover upload failed");
  await uploaded.arrayBuffer();
  const staged = await fetch(
    `${f.apiUrl}/storage/v1/object/public/${f.bucket}/${upload.path}`,
    {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    }
  );
  assert.equal(staged.status, 200);
  assert.deepEqual(Buffer.from(await staged.arrayBuffer()), f.bytes);
  assert.equal(
    (
      await f.one<SessionRow>(
        "grida_forms",
        "response_session",
        `id=eq.${session.id}`
      )
    ).raw[form.fields.name.id],
    draft
  );
  assert.equal(
    (
      await f.rows<ResponseRow>(
        "grida_forms",
        "response",
        `session_id=eq.${session.id}`
      )
    ).length,
    0
  );
  log(
    "forms: carryover draft and real staged bytes prepared through current owner"
  );
  return {
    version: 1,
    sourceOrigin: origin,
    run: f.run,
    formId: form.id,
    projectId: form.projectId,
    sessionId: session.id,
    nameFieldId: form.fields.name.id,
    fileFieldId: form.fields.file.id,
    stagedPath: upload.path,
    targetTable: form.targetTable,
    bucket: f.bucket,
    draft,
    finalName: "Carryover Fixture",
    sha256: createHash("sha256").update(f.bytes).digest("hex"),
    byteLength: f.bytes.length,
    responseCountBefore: (
      await f.rows<ResponseRow>(
        "grida_forms",
        "response",
        `form_id=eq.${form.id}`
      )
    ).length,
    targetCountBefore: (await f.rows("public", form.targetTable)).length,
  };
}

export async function resumeCarryover({
  origin,
  setup,
  carryover: c,
  log = () => {},
}: {
  origin: string;
  setup: FixtureSetup;
  carryover: Carryover;
  log?: Log;
}) {
  assert.equal(c.version, 1);
  for (const id of [c.formId, c.sessionId, c.nameFieldId, c.fileFieldId])
    assert.match(id, /^[a-f0-9-]{36}$/);
  assert.match(c.run, /^[a-f0-9]{12}$/);
  assert.equal(c.targetTable, `forms_local_connected_${c.run}`);
  assert.equal(c.bucket, RESPONSE_BUCKET);
  assert(c.stagedPath.startsWith(`tmp/${c.sessionId}/${c.fileFieldId}/`));
  assert.equal(c.sha256, createHash("sha256").update(FILE_BYTES).digest("hex"));
  assert.equal(c.byteLength, FILE_BYTES.length);
  const db = createFixtureClient({ setup });
  const request = carryoverHttp(origin);
  const form = await db.one("grida_forms", "form", `id=eq.${c.formId}`);
  assert.equal(form.project_id, c.projectId);
  assert.equal(form.is_force_closed, false);
  const session = await db.one<SessionRow>(
    "grida_forms",
    "response_session",
    `id=eq.${c.sessionId}`
  );
  assert.equal(session.form_id, c.formId);
  assert.equal(session.raw[c.nameFieldId], c.draft);
  assert.equal(
    (
      await db.rows<ResponseRow>(
        "grida_forms",
        "response",
        `session_id=eq.${c.sessionId}`
      )
    ).length,
    0
  );
  const loaded = await request<LoadResponse>(
    `/v1/forms/${c.formId}?__gf_session=${c.sessionId}`
  );
  assertPublicRender(loaded);
  assert.equal(loaded.data.session_id, c.sessionId);
  assert.equal(loaded.data.default_values.full_name, c.draft);
  const payload = new FormData();
  payload.set("__gf_session", c.sessionId);
  payload.set("__gf_utc_offset", "0");
  payload.set("full_name", c.finalName);
  payload.set("attachment", c.stagedPath);
  const accepted = await request<Envelope<SubmissionData>>(
    `/v1/forms/submit/${c.formId}`,
    {
      method: "POST",
      body: payload,
    }
  );
  assertPublicSubmission(accepted);
  const response = await db.one<ResponseRow>(
    "grida_forms",
    "response",
    `id=eq.${accepted.data.id}`
  );
  assert.equal(response.form_id, c.formId);
  assert.equal(response.session_id, c.sessionId);
  assert.equal(response.raw.full_name, c.finalName);
  assert.equal(
    (
      await db.rows<ResponseRow>(
        "grida_forms",
        "response",
        `form_id=eq.${c.formId}`
      )
    ).length,
    c.responseCountBefore + 1
  );
  const target = await db.one(
    "public",
    c.targetTable,
    `full_name=eq.${encodeURIComponent(c.finalName)}`
  );
  assert.equal(
    (await db.rows("public", c.targetTable)).length,
    c.targetCountBefore + 1
  );
  assert.equal(target.attachment, `connected/${c.run}/${target.id}/pixel.png`);
  const file = await db.one<ResponseFieldRow>(
    "grida_forms",
    "response_field",
    `response_id=eq.${response.id}&form_field_id=eq.${c.fileFieldId}`
  );
  assert.deepEqual(file.storage_object_paths, [target.attachment]);
  const committed = await fetch(
    `${setup.apiUrl}/storage/v1/object/public/${c.bucket}/${target.attachment}`,
    {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    }
  );
  assert.equal(committed.status, 200);
  assert.deepEqual(Buffer.from(await committed.arrayBuffer()), FILE_BYTES);
  const staged = await fetch(
    `${setup.apiUrl}/storage/v1/object/public/${c.bucket}/${c.stagedPath}`,
    {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    }
  );
  assert.notEqual(staged.status, 200);
  await staged.arrayBuffer();
  assert.equal(
    (
      await db.one<SessionRow>(
        "grida_forms",
        "response_session",
        `id=eq.${c.sessionId}`
      )
    ).raw[c.nameFieldId],
    c.finalName
  );
  log(
    "forms: new owner resumed the existing draft/session and committed its original bytes"
  );
  return {
    resumed: true,
    sourceOrigin: c.sourceOrigin,
    targetOrigin: origin,
    addedResponses: 1,
    addedConnectedRows: 1,
    bytes: c.byteLength,
  };
}

export type Carryover = Awaited<ReturnType<typeof prepareCarryover>>;

export async function runTransportScenarios({
  origin,
  fixture: f,
  webOrigin,
}: ScenarioOptions & { webOrigin: string }) {
  const base = new URL(origin);
  assert.equal(base.hostname, "127.0.0.1");
  assert.equal(base.protocol, "http:");
  const expectedOrigin = new URL(webOrigin).origin;
  const requestId = "client-chosen-id-must-not-be-trusted";
  const path = `/v1/forms/${f.connected.id}/session`;
  const observedIds = new Set<string>();
  const headerValues = (value: string | null) =>
    (value ?? "")
      .toLowerCase()
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  function platformTransport(response: Response) {
    assert(
      headerValues(response.headers.get("cache-control")).includes("no-store")
    );
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const id = response.headers.get("x-request-id");
    assert(
      id && id.length >= 16,
      "Every response needs a generated request ID"
    );
    assert.notEqual(id, requestId, "The API must generate its own request ID");
    assert(
      !observedIds.has(id),
      "Different requests must receive distinct request IDs"
    );
    observedIds.add(id);
    assert.equal(response.headers.get("set-cookie"), null);
    return id;
  }
  function transport(response: Response) {
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      null
    );
    assert(
      headerValues(
        response.headers.get("access-control-expose-headers")
      ).includes("x-request-id")
    );
    return platformTransport(response);
  }
  function outsideForms(response: Response) {
    platformTransport(response);
    for (const name of response.headers.keys()) {
      assert(
        !name.startsWith("access-control-"),
        `Forms policy escaped its namespace: ${name}`
      );
    }
  }
  async function json<T>(response: Response): Promise<T> {
    assert(
      response.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    );
    const value: unknown = await response.json();
    assert(value && typeof value === "object");
    assert.equal(Object.hasOwn(value, "stack"), false);
    assert.equal(Object.hasOwn(value, "cause"), false);
    return value as T;
  }
  const simple = await fetch(new URL(path, base), {
    headers: { Origin: expectedOrigin, "x-request-id": requestId },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(simple.status, 200);
  transport(simple);
  const session = (await json<Envelope<SessionData>>(simple)).data;
  assert.deepEqual(Object.keys(session).sort(), ["form_id", "id"]);
  assert.equal(session.form_id, f.connected.id);

  const head = await fetch(new URL(path, base), {
    method: "HEAD",
    headers: { Origin: expectedOrigin, "x-request-id": requestId },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(head.status, 405);
  transport(head);
  assert.equal(await head.text(), "");

  const allowedHeaders = [
    "content-type",
    "x-gf-simulator",
    "x-gf-geo-country",
    "x-gf-geo-region",
    "x-gf-geo-city",
    "x-gf-geo-latitude",
    "x-gf-geo-longitude",
    "x-request-id",
  ];
  const preflight = await fetch(new URL(path, base), {
    method: "OPTIONS",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Origin: "https://consumer.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": allowedHeaders.join(","),
      "x-request-id": requestId,
    },
  });
  assert.equal(preflight.status, 204);
  transport(preflight);
  assert.deepEqual(
    headerValues(preflight.headers.get("access-control-allow-headers")).sort(),
    allowedHeaders.slice().sort()
  );
  assert.deepEqual(
    headerValues(preflight.headers.get("access-control-allow-methods")).sort(),
    ["get", "post", "put", "patch", "options"].sort()
  );
  assert.equal(await preflight.text(), "");

  const missing = await fetch(
    new URL("/v1/forms/not-a-real-operation/absent", base),
    {
      headers: { Origin: expectedOrigin, "x-request-id": requestId },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    }
  );
  assert.equal(missing.status, 404);
  const missingRequestId = transport(missing);
  const missingBody = await json<{
    error: { code: string; message: string };
    request_id: string;
  }>(missing);
  assert.equal(typeof missingBody.error?.code, "string");
  assert.equal(typeof missingBody.error?.message, "string");
  assert.equal(missingBody.request_id, missingRequestId);
  assert.equal(Object.hasOwn(missingBody.error, "stack"), false);

  const before = await f.one<SessionRow>(
    "grida_forms",
    "response_session",
    `id=eq.${session.id}`
  );
  const malformed = await fetch(
    new URL(
      `/v1/forms/session/${session.id}/field/${f.connected.fields.name.id}`,
      base
    ),
    {
      method: "PATCH",
      body: "{broken",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Origin: expectedOrigin,
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
    }
  );
  assert.equal(malformed.status, 400);
  transport(malformed);
  const malformedBody = await json<{ error: unknown }>(malformed);
  assert(malformedBody.error);
  assert.deepEqual(
    await f.one<SessionRow>(
      "grida_forms",
      "response_session",
      `id=eq.${session.id}`
    ),
    before
  );

  const health = await fetch(new URL("/health", base), {
    headers: { Origin: expectedOrigin, "x-request-id": requestId },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(health.status, 200);
  outsideForms(health);
  assert.deepEqual(await json(health), { status: "ok" });

  // Keep these independent literals: importing the client's producer here would
  // let a matching client/server regression conceal the old public contract.
  const oldField = `/v1/session/${session.id}/field/${f.connected.fields.name.id}`;
  const retired: [string, string][] = [
    ["GET", `/v1/${f.connected.id}`],
    ["GET", `/v1/${f.connected.id}/session`],
    ["GET", `/v1/submit/${f.connected.id}`],
    ["POST", `/v1/submit/${f.connected.id}`],
    ["PATCH", oldField],
    ["POST", `${oldField}/file/upload/signed-url`],
    ["PUT", `${oldField}/file/upload/signed-url`],
    ["GET", `${oldField}/file/preview/public-url`],
    ["POST", `${oldField}/challenge/email/start`],
    ["POST", `${oldField}/challenge/email/verify`],
    ["GET", `${oldField}/challenge/email/state`],
    ["GET", `${oldField}/search/meta`],
  ];
  async function assertOutsideNamespace(
    method: string,
    pathname: string,
    status = 404
  ) {
    const response = await fetch(new URL(pathname, base), {
      method,
      headers: {
        Origin: expectedOrigin,
        "x-request-id": requestId,
        ...(method === "OPTIONS"
          ? { "Access-Control-Request-Method": "POST" }
          : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    assert.equal(response.status, status, `${method} ${pathname}`);
    outsideForms(response);
    await json(response);
  }
  for (const [method, pathname] of retired) {
    await assertOutsideNamespace(method, pathname);
  }
  for (const pathname of new Set(retired.map(([, pathname]) => pathname))) {
    await assertOutsideNamespace("OPTIONS", pathname);
  }
  for (const pathname of [
    "/v1/storage/buckets",
    "/v1/forms-other/test",
    "/v1/formsfoo",
  ]) {
    await assertOutsideNamespace("GET", pathname);
    await assertOutsideNamespace("OPTIONS", pathname);
  }
  await assertOutsideNamespace("OPTIONS", "/health", 405);
  return {
    count: 8,
    scenarios: [
      "public CORS response",
      "HEAD without response body",
      "explicit preflight headers and methods",
      "correlated sanitized JSON 404",
      "malformed JSON 400 without writes",
      "platform health without Forms CORS",
      "all unqualified Forms operations and preflights return 404",
      "unrelated namespaces receive no Forms policy",
    ],
    credentials: false,
    cache: "no-store",
  };
}

/** Exercise actual editor callers in a separate credential-free process. */
export async function runClientScenarios({
  origin,
  fixture: f,
  provider,
  runClient,
  log = () => {},
}: ScenarioOptions & {
  provider: Provider;
  runClient: (input: ClientProofInput) => Promise<ClientProofOutput>;
}) {
  assert.equal(typeof runClient, "function");
  const request = carryoverHttp(origin);
  const form = f.directFile;
  async function createSession(target: FormIdentity) {
    const result = await request<Envelope<SessionData>>(
      `/v1/forms/${target.id}/session`
    );
    assert.equal(result.error, null);
    assert.deepEqual(Object.keys(result.data).sort(), ["form_id", "id"]);
    assert.equal(result.data.form_id, target.id);
    return result.data.id;
  }
  const sdkSession = await createSession(form);
  const manualSession = await createSession(form);
  const fileSession = await createSession(form);
  const challengeSession = await createSession(f.b);
  const before = await f.rows<ResponseRow>(
    "grida_forms",
    "response",
    `form_id=eq.${form.id}`
  );
  const foreignBefore = await f.rows<ResponseRow>(
    "grida_forms",
    "response",
    `form_id=eq.${f.b.id}`
  );
  const payload = {
    apiOrigin: origin,
    storageOrigin: f.apiUrl,
    sdk: {
      formId: form.id,
      sessionId: sdkSession,
      values: { full_name: "Actual SDK caller" },
    },
    manual: {
      formId: form.id,
      sessionId: manualSession,
      values: { full_name: "Actual manual caller" },
    },
    missingFormId: randomUUID(),
    file: {
      sessionId: fileSession,
      fieldId: form.fields.file.id,
      name: "client.png",
      bytesBase64: f.bytes.toString("base64"),
    },
    challenge: {
      sessionId: challengeSession,
      fieldId: f.b.fields.challenge.id,
      email: `clients-${f.run}@example.com`,
    },
  };
  // Only public origins, respondent capabilities and synthetic input cross this
  // process boundary. Auth/service-role keys stay in the parent fixture client.
  const result = await runClient(payload);
  assert.deepEqual(result.denied, { sdk: true, manual: true });
  assert.equal(result.manual.completed, true);
  assert.deepEqual(Object.keys(result.sdk).sort(), ["customer_id", "id"]);
  assert.match(result.sdk.customer_id!, /^[a-f0-9-]{36}$/);

  const accepted = [];
  for (const context of [payload.sdk, payload.manual]) {
    const response = await f.one<ResponseRow>(
      "grida_forms",
      "response",
      `form_id=eq.${context.formId}&session_id=eq.${context.sessionId}`
    );
    accepted.push(response);
    const customer = await f.one(
      "public",
      "customer",
      `uid=eq.${response.customer_id}`
    );
    assert.equal(customer.project_id, f.projectA.id);
    assert.equal(customer.is_email_verified, false);
    assert.equal(response.raw.full_name, context.values.full_name);
    const field = await f.one<ResponseFieldRow>(
      "grida_forms",
      "response_field",
      `response_id=eq.${response.id}&form_field_id=eq.${form.fields.name.id}`
    );
    assert.equal(field.form_id, form.id);
    assert.equal(field.value, context.values.full_name);
    const session = await f.one<SessionRow>(
      "grida_forms",
      "response_session",
      `id=eq.${context.sessionId}`
    );
    assert.equal(session.form_id, form.id);
    assert.equal(session.raw[form.fields.name.id], context.values.full_name);
  }
  assert.equal(accepted[0].id, result.sdk.id);
  assert.equal(accepted[0].customer_id, result.sdk.customer_id);
  assert.notEqual(accepted[0].id, accepted[1].id);
  assert.equal(
    (
      await f.rows<ResponseRow>(
        "grida_forms",
        "response",
        `form_id=eq.${form.id}`
      )
    ).length,
    before.length + 2
  );
  assert.equal(
    (
      await f.rows<ResponseRow>(
        "grida_forms",
        "response",
        `form_id=eq.${payload.missingFormId}`
      )
    ).length,
    0
  );
  log(
    "forms: actual SDK/manual callers persist success and refuse unknown forms"
  );

  assert.equal(typeof result.file.path, "string");
  assert(
    result.file.path.startsWith(`tmp/${fileSession}/${form.fields.file.id}/`)
  );
  assert.equal(result.file.path.split("/").at(-1), payload.file.name);
  const publicUrl = new URL(result.file.publicUrl);
  assert.equal(publicUrl.origin, f.apiUrl);
  assert.equal(
    decodeURIComponent(publicUrl.pathname),
    `/storage/v1/object/public/${f.bucket}/${result.file.path}`
  );
  const bytes = await fetch(publicUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(bytes.status, 200);
  assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), f.bytes);
  assert.equal(
    (
      await f.rows<ResponseRow>(
        "grida_forms",
        "response",
        `session_id=eq.${fileSession}`
      )
    ).length,
    0
  );
  log("forms: actual file uploader/resolver preserves real Storage bytes");

  assert.equal(result.challenge.state, "challenge-session-started");
  assert.equal(result.challenge.invalidVerifyRejected, true);
  const challengeRow = await f.one<SessionRow>(
    "grida_forms",
    "response_session",
    `id=eq.${challengeSession}`
  );
  assert.equal(challengeRow.form_id, f.b.id);
  assert.equal(challengeRow.customer_id, null);
  const state = challengeRow.raw[
    `__challenge_email__${f.b.fields.challenge.id}`
  ] as ChallengeState;
  assert.equal(state.state, "challenge-session-started");
  assert.equal(state.challenge_id, result.challenge.challengeId);
  assert.equal(state.email, payload.challenge.email);
  assert.equal(state.customer_uid, null);
  const customer = await f.one(
    "public",
    "customer",
    `project_id=eq.${f.projectB.id}&email=eq.${payload.challenge.email}`
  );
  assert.equal(customer.is_email_verified, false);
  const mail = await provider.awaitEmail({ to: payload.challenge.email });
  assert.match(mail.otp!, /^\d{6}$/);
  assert.deepEqual(
    await f.rows<ResponseRow>(
      "grida_forms",
      "response",
      `form_id=eq.${f.b.id}`
    ),
    foreignBefore
  );
  log("forms: actual challenge client cannot verify an unrelated challenge");
  return {
    count: 3,
    scenarios: [
      "actual SDK/manual success and missing-form refusal",
      "actual uploader/resolver Storage bytes",
      "actual challenge start/state and invalid verification refusal",
    ],
    outcomes: {
      acceptedResponses: 2,
      storedBytes: f.bytes.length,
      verifiedCustomers: 0,
    },
  };
}
