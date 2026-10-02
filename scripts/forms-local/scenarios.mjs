import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  createFixtureClient,
  FILE_BYTES,
  RESPONSE_BUCKET,
} from "./fixtures.mjs";

// Independent HTTP/SQL outcomes, shared by the pre-move Next artifact and the
// extracted API. No imports of route functions or application validators.
export async function runFormsScenarios({
  origin,
  webOrigin = "http://localhost:3000",
  fixture: f,
  provider,
  log = () => {},
}) {
  const base = new URL(origin);
  assert.equal(base.hostname, "127.0.0.1");
  assert.equal(base.protocol, "http:");
  const web = new URL(webOrigin);
  assert(["127.0.0.1", "localhost"].includes(web.hostname));
  assert.equal(web.protocol, "http:");
  const completed = [];
  const done = (name) => {
    completed.push(name);
    log(`forms: ${name}`);
  };
  const sessionPath = (session, field) =>
    `/v1/session/${session}/field/${field}`;

  async function request(
    path,
    { method = "GET", json, body, headers = {} } = {}
  ) {
    const target = new URL(path, base);
    assert.equal(target.origin, base.origin);
    const options = {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "x-gf-geo-country": "KR",
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
    let data;
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
  function success(result, label) {
    assert.equal(
      result.status,
      200,
      `${label}: expected HTTP 200, got ${result.status}`
    );
    assert(result.data !== null, `${label}: expected JSON`);
    return result.data;
  }
  function denied(result, label) {
    assert(
      [400, 401, 403, 404].includes(result.status),
      `${label}: expected explicit client denial, got ${result.status}`
    );
  }
  async function session(form) {
    const data = success(
      await request(`/v1/${form.id}/session`),
      "create session"
    ).data;
    assert.equal(data.form_id, form.id);
    assert.match(data.id, /^[a-f0-9-]{36}$/);
    return data.id;
  }
  const sessionRow = (id) =>
    f.one("grida_forms", "response_session", `id=eq.${id}`);
  const responseRows = (form) =>
    f.rows("grida_forms", "response", `form_id=eq.${form.id}&order=id`);
  const inventory = () =>
    f.one("grida_commerce", "inventory_item", `id=eq.${f.a.inventory.itemId}`);
  function submission(sessionId, values = {}) {
    const body = new FormData();
    if (sessionId) body.set("__gf_session", sessionId);
    body.set("__gf_utc_offset", "0");
    for (const [key, value] of Object.entries(values)) body.set(key, value);
    return body;
  }
  const submit = (form, sessionId, values, headers) =>
    request(`/v1/submit/${form.id}`, {
      method: "POST",
      body: submission(sessionId, values),
      headers,
    });
  const fileDto = (name) => ({
    file: { name, size: f.bytes.length, type: "image/png", lastModified: 0 },
  });
  async function uploadBytes(upload) {
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
  const load = success(await request(`/v1/${f.a.id}`), "load native form");
  assert.equal(load.error, null);
  assert.equal(load.data.title, `Forms baseline native ${f.run}`);
  assert.equal(load.data.is_open, true);
  assert(load.data.fields.some((field) => field.id === f.a.fields.name.id));
  const aSession = load.data.session_id;
  assert.equal((await sessionRow(aSession)).form_id, f.a.id);
  const bSession = await session(f.b);
  denied(await request(`/v1/${randomUUID()}`), "unknown form");
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
  ]) {
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
    await request(`/v1/${f.a.id}?__gf_session=${bSession}`),
    "load cannot rebind foreign session"
  );
  assert.deepEqual(await sessionRow(bSession), foreignBefore);
  assert.equal((await responseRows(f.a)).length, 0);
  assert.equal((await inventory()).available, 2);
  done("partial data and reserved/cross-resource denial");

  const filePath = sessionPath(aSession, f.a.fields.file.id);
  const upload = success(
    await request(`${filePath}/file/upload/signed-url`, {
      method: "POST",
      json: fileDto("pixel.png"),
    }),
    "signed upload"
  );
  assert.equal(upload.error, null);
  assert(upload.data.path.startsWith(`tmp/${aSession}/${f.a.fields.file.id}/`));
  await uploadBytes(upload.data);
  const preview = success(
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
    success(await request(`${challengePath}/state`), "initial challenge").state
      .state,
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
  const started = success(
    await request(`${challengePath}/start`, {
      method: "POST",
      json: { email: f.a.email },
    }),
    "OTP start"
  );
  assert.equal(started.state.state, "challenge-session-started");
  const email = await provider.awaitEmail({ to: f.a.email });
  assert.match(email.otp, /^\d{6}$/);
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
  const verified = success(
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
    success(await request(`${challengePath}/state`), "verified state").state
      .state,
    "challenge-success"
  );
  done("real OTP challenge, verified customer and cross-field denial");

  const foreignUploadSession = await session(f.a);
  const foreignUpload = success(
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

  const accepted = success(
    await submit(f.a, aSession, {
      full_name: "Ada Fixture",
      contact_email: f.a.provisionalEmail,
      __gf_customer_email: f.a.email,
      attachment: upload.data.path,
      ticket: f.a.inventory.optionId,
    }),
    "multipart submission"
  );
  assert(accepted.data?.id, "Submit did not return persisted response ID");
  const response = await f.one(
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
  const fields = await f.rows(
    "grida_forms",
    "response_field",
    `response_id=eq.${response.id}`
  );
  assert.equal(fields.length, Object.keys(f.a.fields).length);
  assert(fields.every((field) => field.form_id === f.a.id));
  const textField = fields.find(
    (field) => field.form_field_id === f.a.fields.name.id
  );
  assert.equal(textField.value, "Ada Fixture");
  const optionField = fields.find(
    (field) => field.form_field_id === f.a.fields.choice.id
  );
  assert.equal(optionField.form_field_option_id, f.a.inventory.optionId);
  const challengeField = fields.find(
    (field) => field.form_field_id === f.a.fields.challenge.id
  );
  assert.equal(challengeField.challenge_state.state, "challenge-success");
  assert.equal(challengeField.challenge_state.customer_uid, customerId);
  const fileField = fields.find(
    (field) => field.form_field_id === f.a.fields.file.id
  );
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
      await request(`/v1/submit/${f.a.id}/hooks/${hook}`, {
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
  ]) {
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
    const responses = await f.rows(
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
  const meta = success(
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
  const connectedUpload = success(
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
  const connectedResult = success(
    await submit(f.connected, connectedSession, {
      full_name: "Connected Fixture",
      attachment: connectedUpload.path,
    }),
    "connected submission"
  );
  assert(connectedResult.data?.id);
  const connectedRows = await f.rows("public", f.connected.targetTable);
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
    (await request(`/v1/submit/${f.connected.id}?${conflicting}`)).status,
    400
  );
  assert.equal((await f.rows("public", f.connected.targetTable)).length, 1);
  assert.equal((await responseRows(f.connected)).length, 1);
  const identical = new URLSearchParams({ __gf_session: duplicateSession });
  identical.append("full_name", "GET Fixture");
  identical.append("full_name", "GET Fixture");
  const getResult = success(
    await request(`/v1/submit/${f.connected.id}?${identical}`),
    "GET submit with coherent duplicates"
  );
  assert.equal(getResult.data.raw.full_name, "GET Fixture");
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
  const destination = new URL(html.headers.get("location"));
  assert.equal(
    destination.origin,
    web.origin,
    "Receipt navigation escaped the configured fixture web origin"
  );
  assert(destination.pathname.includes(f.connected.id));
  assert(destination.searchParams.get("rid"));
  assert.equal((await f.rows("public", f.connected.targetTable)).length, 3);
  assert.equal((await responseRows(f.connected)).length, 3);
  done("GET duplicate policy and native HTML redirect transport");

  await f.patch("grida_forms", "form", `id=eq.${f.connected.id}`, {
    is_force_closed: true,
  });
  const closed = success(await request(`/v1/${f.connected.id}`), "closed load");
  assert.equal(closed.data.is_open, false);
  assert.equal(closed.error.code, "FORM_FORCE_CLOSED");
  const closedSubmit = await submit(f.connected, closed.data.session_id, {
    full_name: "Closed Fixture",
  });
  assert.equal(closedSubmit.status, 403);
  assert.equal(closedSubmit.data.error, "FORM_CLOSED_WHILE_RESPONDING");
  assert.equal((await f.rows("public", f.connected.targetTable)).length, 3);
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
  const soldOut = success(await request(`/v1/${f.a.id}`), "sold-out load");
  assert.equal(soldOut.data.is_open, false);
  assert.equal(soldOut.error.code, "FORM_SOLD_OUT");
  const soldOutChallenge = `${sessionPath(soldOut.data.session_id, f.a.fields.challenge.id)}/challenge/email`;
  const soldOutStarted = success(
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
  assert.equal(soldOutSubmit.data.error, "FORM_SOLD_OUT");
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
  const completionStarted = success(
    await request(`${completionChallenge}/start`, {
      method: "POST",
      json: { email: completionForm.email },
    }),
    "completion-failure OTP start"
  );
  const completionMail = await provider.awaitEmail({
    to: completionForm.email,
  });
  const completionVerified = success(
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
  const retainedFields = await f.rows(
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
      foreignResponses: 0,
      inventoryConsumed: 1,
      actualStorageBytes: f.bytes.length,
    },
  };
}

function carryoverHttp(origin) {
  const base = new URL(origin);
  assert.equal(base.protocol, "http:");
  assert.equal(base.hostname, "127.0.0.1");
  return async (path, { method = "GET", json, body } = {}) => {
    const url = new URL(path, base);
    assert.equal(url.origin, base.origin);
    const options = {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "x-gf-geo-country": "KR",
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

// The returned session ID is a respondent capability. Keep this metadata in the
// owned stack's private directory; do not put it in the safe execution report.
export async function prepareCarryover({ origin, fixture: f, log = () => {} }) {
  const request = carryoverHttp(origin);
  const form = f.connected;
  const { data: session } = await request(`/v1/${form.id}/session`);
  assert.equal(session.form_id, form.id);
  const draft = "Carryover draft";
  await request(`/v1/session/${session.id}/field/${form.fields.name.id}`, {
    method: "PATCH",
    json: { value: draft },
  });
  const { data: upload } = await request(
    `/v1/session/${session.id}/field/${form.fields.file.id}/file/upload/signed-url`,
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
    (await f.one("grida_forms", "response_session", `id=eq.${session.id}`)).raw[
      form.fields.name.id
    ],
    draft
  );
  assert.equal(
    (await f.rows("grida_forms", "response", `session_id=eq.${session.id}`))
      .length,
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
      await f.rows("grida_forms", "response", `form_id=eq.${form.id}`)
    ).length,
    targetCountBefore: (await f.rows("public", form.targetTable)).length,
  };
}

export async function resumeCarryover({
  origin,
  setup,
  carryover: c,
  log = () => {},
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
  const session = await db.one(
    "grida_forms",
    "response_session",
    `id=eq.${c.sessionId}`
  );
  assert.equal(session.form_id, c.formId);
  assert.equal(session.raw[c.nameFieldId], c.draft);
  assert.equal(
    (await db.rows("grida_forms", "response", `session_id=eq.${c.sessionId}`))
      .length,
    0
  );
  const loaded = await request(`/v1/${c.formId}?__gf_session=${c.sessionId}`);
  assert.equal(loaded.data.session_id, c.sessionId);
  assert.equal(loaded.data.default_values.full_name, c.draft);
  const payload = new FormData();
  payload.set("__gf_session", c.sessionId);
  payload.set("__gf_utc_offset", "0");
  payload.set("full_name", c.finalName);
  payload.set("attachment", c.stagedPath);
  const accepted = await request(`/v1/submit/${c.formId}`, {
    method: "POST",
    body: payload,
  });
  const response = await db.one(
    "grida_forms",
    "response",
    `id=eq.${accepted.data.id}`
  );
  assert.equal(response.form_id, c.formId);
  assert.equal(response.session_id, c.sessionId);
  assert.equal(response.raw.full_name, c.finalName);
  assert.equal(
    (await db.rows("grida_forms", "response", `form_id=eq.${c.formId}`)).length,
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
  const file = await db.one(
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
    (await db.one("grida_forms", "response_session", `id=eq.${c.sessionId}`))
      .raw[c.nameFieldId],
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
