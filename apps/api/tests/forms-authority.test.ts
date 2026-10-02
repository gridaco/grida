import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
const NextRequest = Request;

const mocks = vi.hoisted(() => ({
  sign: vi.fn<
    (path: string) => Promise<{
      data: { signedUrl: string; path: string; token: string };
      error: null;
    }>
  >(),
  from: vi.fn<(table: string) => unknown>(),
  rpc: vi.fn<
    (
      name: string,
      args: unknown
    ) => Promise<{ data: null; error: { message: string } | null }>
  >(),
  send: vi.fn<
    (message: unknown) => Promise<{
      data: { id: string } | null;
      error: { message: string } | null;
    }>
  >(),
}));
vi.mock("../server/forms/db", () => ({
  service_role: {
    forms: {
      from: mocks.from,
      rpc: mocks.rpc,
      storage: { from: () => ({ createSignedUploadUrl: mocks.sign }) },
    },
    workspace: { from: mocks.from },
  },
}));

vi.mock("../server/forms/clients/resend/index", () => ({
  resend: { emails: { send: mocks.send } },
}));
vi.mock("../server/forms/clients/ipinfo/index", () => ({
  ipinfo: vi.fn<() => Promise<null>>().mockResolvedValue(null),
}));

import { PATCH as patch } from "../server/forms/handlers/partial";
import { GET as read } from "../server/forms/handlers/load";
import { POST as post, GET as query } from "../server/forms/handlers/submit";
import {
  POST as sign,
  PUT as signUnique,
} from "../server/forms/handlers/upload";
import { GET as preview } from "../server/forms/handlers/preview";
const adapt =
  <P>(
    handler: (request: Request, params: P) => Promise<Response | undefined>
  ) =>
  async (request: Request, context: { params: Promise<P> }) =>
    (await handler(request, await context.params))!;
const PATCH = adapt(patch),
  load = adapt(read),
  submit = adapt(post),
  submitQuery = adapt(query),
  signUpload = adapt(sign),
  signUniqueUpload = adapt(signUnique),
  previewFile = adapt(preview);

const formId = "10000000-0000-4000-8000-000000000001";
const foreignForm = "10000000-0000-4000-8000-000000000002";
const sessionId = "20000000-0000-4000-8000-000000000001";
const fieldId = "30000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ id: formId }) };

function request(path: string, body: unknown, key?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-grida-s2s-key": key } : {}),
    },
    body: JSON.stringify(body),
  });
}

// A query recorder, not a substitute for the runner's real PostgreSQL proof.
function database(tables: Record<string, Record<string, unknown>[]>) {
  const writes: unknown[] = [];
  const reads: { table: string; filters: Record<string, unknown> }[] = [];
  mocks.from.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    let mutation: unknown;
    const result = () => {
      if (mutation) writes.push({ table, filters, mutation });
      else reads.push({ table, filters });
      const data =
        tables[table]?.find((row) =>
          Object.entries(filters).every(([key, value]) => row[key] === value)
        ) ?? null;
      return { data, error: null };
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        filters[key] = value;
        return query;
      },
      update: (value: unknown) => {
        mutation = value;
        return query;
      },
      upsert: (value: unknown) => {
        mutation = value;
        return query;
      },
      insert: (value: unknown) => {
        mutation = value;
        return query;
      },
      single: async () => result(),
      maybeSingle: async () => result(),
      // oxlint-disable-next-line unicorn/no-thenable -- Supabase query builders are deliberately awaitable.
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve),
    };
    return query;
  });
  return { writes, reads };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.send.mockResolvedValue({ data: { id: "mail-fixture" }, error: null });
  mocks.sign.mockImplementation(async (path) => ({
    data: {
      path,
      signedUrl: "https://storage.example.test/upload",
      token: "fixture-token",
    },
    error: null,
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("partial response authority", () => {
  test("refuses an internal challenge key before writing raw state", async () => {
    database({ response_session: [{ id: sessionId, form_id: formId }] });
    const response = await PATCH(
      request("/partial", { value: { state: "challenge-success" } }),
      {
        params: Promise.resolve({
          session: sessionId,
          field: `__challenge_email__${fieldId}`,
        }),
      }
    );
    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test("refuses an existing field belonging to another form", async () => {
    database({
      response_session: [{ id: sessionId, form_id: formId }],
      attribute: [{ id: fieldId, form_id: foreignForm }],
    });
    const response = await PATCH(request("/partial", { value: "injected" }), {
      params: Promise.resolve({ session: sessionId, field: fieldId }),
    });
    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test("persists a field belonging to the session and reports RPC failure", async () => {
    database({
      response_session: [{ id: sessionId, form_id: formId }],
      attribute: [{ id: fieldId, form_id: formId }],
    });
    const context = {
      params: Promise.resolve({ session: sessionId, field: fieldId }),
    };
    expect(
      (await PATCH(request("/partial", { value: "valid" }), context)).status
    ).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("set_response_session_field_value", {
      session_id: sessionId,
      key: fieldId,
      value: "valid",
    });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "unavailable" },
    });
    expect(
      (await PATCH(request("/partial", { value: "lost" }), context)).status
    ).toBe(500);
  });
});

describe("form/session resource binding", () => {
  const form = {
    id: formId,
    project_id: 1,
    fields: [],
    options: [],
    default_page: { blocks: [], lang: "en" },
  };
  test("loading cannot reassign another form's session", async () => {
    const db = database({
      form: [form],
      response_session: [{ id: sessionId, form_id: foreignForm, raw: {} }],
    });
    const response = await load(
      new NextRequest(
        `http://localhost:3000/v1/${formId}?__gf_session=${sessionId}`
      ),
      params
    );
    expect(response.status).toBe(404);
    expect(db.writes).toEqual([]);
  });
  test("submission binds sessions even when the form has no email challenge", async () => {
    const db = database({
      form: [form],
      response_session: [{ id: sessionId, form_id: foreignForm, raw: {} }],
    });
    const body = new FormData();
    body.set("__gf_session", sessionId);
    const response = await submit(
      new NextRequest(`http://localhost:3000/v1/submit/${formId}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body,
      }),
      params
    );
    expect(response.status).toBe(400);
    expect(db.writes).toEqual([]);
  });
  test("conflicting repeated scalar input is rejected before writes", async () => {
    const db = database({
      form: [
        { ...form, fields: [{ id: fieldId, name: "full_name", type: "text" }] },
      ],
    });
    const response = await submitQuery(
      new NextRequest(
        `http://localhost:3000/v1/submit/${formId}?full_name=First&full_name=Different`,
        { headers: { Accept: "application/json" } }
      ),
      params
    );
    expect(response.status).toBe(400);
    expect(db.writes).toEqual([]);
  });
  test.each(["file", "richtext"])(
    "%s staged files must belong to the submitted field",
    async (type) => {
      const db = database({
        form: [
          { ...form, fields: [{ id: fieldId, name: "attachment", type }] },
        ],
        response_session: [{ id: sessionId, form_id: formId, raw: {} }],
      });
      const path = `tmp/${sessionId}/30000000-0000-4000-8000-000000000002/other.txt`;
      const body = new FormData();
      body.set("__gf_session", sessionId);
      body.set(
        "attachment",
        type === "file"
          ? path
          : JSON.stringify({ src: `grida-tmp://${path}?grida-tmp=true` })
      );
      const response = await submit(
        new NextRequest(`http://localhost:3000/v1/submit/${formId}`, {
          method: "POST",
          headers: { Accept: "application/json" },
          body,
        }),
        params
      );
      expect(response.status).toBe(400);
      expect(db.writes).toEqual([]);
    }
  );
});

describe("session file authority", () => {
  const context = {
    params: Promise.resolve({ session: sessionId, field: fieldId }),
  };
  test("signs a real staged path using the shared filename implementation", async () => {
    database({
      response_session: [
        {
          id: sessionId,
          form: {
            fields: [{ id: fieldId, storage: null }],
            supabase_connection: null,
          },
        },
      ],
    });
    const response = await signUpload(
      request("/sign", { file: { name: "file,name.png" } }),
      context
    );
    expect(response.status).toBe(200);
    expect(mocks.sign).toHaveBeenCalledWith(
      `tmp/${sessionId}/${fieldId}/file-name.png`,
      undefined
    );
  });
  test.each([
    ["POST", signUpload],
    ["PUT", signUniqueUpload],
  ] as const)(
    "%s signing rejects a foreign field with a client error",
    async (_method, handler) => {
      database({
        response_session: [
          { id: sessionId, form: { fields: [], supabase_connection: null } },
        ],
      });
      expect(
        (
          await handler(
            request("/sign", { file: { name: "test.txt" } }),
            context
          )
        ).status
      ).toBe(404);
    }
  );
  test("preview rejects a path for another field", async () => {
    database({
      response_session: [
        {
          id: sessionId,
          form: {
            fields: [{ id: fieldId, storage: null }],
            supabase_connection: null,
          },
        },
      ],
    });
    const response = await previewFile(
      new NextRequest(
        `http://localhost:3000/preview?path=tmp/${sessionId}/other-field/test.txt`
      ),
      context
    );
    expect(response.status).toBe(400);
  });
});
