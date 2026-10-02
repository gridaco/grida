import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
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
vi.mock("@/lib/supabase/server", () => ({
  service_role: {
    forms: { from: mocks.from, rpc: mocks.rpc },
    workspace: { from: mocks.from },
  },
}));
vi.mock("@/lib/supabase/vault", () => ({ secureformsclient: {} }));
vi.mock("@/clients/resend", () => ({
  resend: { emails: { send: mocks.send } },
}));
vi.mock("@/clients/ipinfo", () => ({
  ipinfo: vi.fn<() => Promise<null>>().mockResolvedValue(null),
}));

import { PATCH } from "@/app/(api)/(public)/v1/session/[session]/field/[field]/route";
import { GET as load } from "@/app/(api)/(public)/v1/[id]/route";
import {
  POST as submit,
  GET as submitQuery,
} from "@/app/(api)/(public)/v1/submit/[id]/route";
import { POST as clear } from "@/app/(api)/(public)/v1/submit/[id]/hooks/clearsession/route";
import { POST as index } from "@/app/(api)/(public)/v1/submit/[id]/hooks/postindexing/route";
import { POST as notify } from "@/app/(api)/(public)/v1/submit/[id]/hooks/notification-respondent-email/route";
import { OnSubmit } from "@/app/(api)/(public)/v1/submit/[id]/hooks";
import {
  POST as signUpload,
  PUT as signUniqueUpload,
} from "@/app/(api)/(public)/v1/session/[session]/field/[field]/file/upload/signed-url/route";
import { GET as previewFile } from "@/app/(api)/(public)/v1/session/[session]/field/[field]/file/preview/public-url/route";

const formId = "10000000-0000-4000-8000-000000000001";
const foreignForm = "10000000-0000-4000-8000-000000000002";
const sessionId = "20000000-0000-4000-8000-000000000001";
const fieldId = "30000000-0000-4000-8000-000000000001";
const hookKey = "forms-test-internal-completion-key";
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
  vi.stubEnv("GRIDA_S2S_PRIVATE_API_KEY", hookKey);
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.send.mockResolvedValue({ data: { id: "mail-fixture" }, error: null });
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

describe("submission completion authority", () => {
  test.each([
    ["clear", clear],
    ["index", index],
    ["notify", notify],
  ] as const)(
    "%s rejects unauthenticated requests before data access",
    async (_name, handler) => {
      const response = await handler(
        request("/hook", { response_id: "response", session_id: sessionId }),
        params
      );
      expect(response.status).toBe(401);
      expect(mocks.from).not.toHaveBeenCalled();
    }
  );
  test("session sync rejects a response from another form", async () => {
    const db = database({
      form: [{ id: formId, fields: [] }],
      response: [
        {
          id: "response",
          form_id: foreignForm,
          session_id: sessionId,
          raw: {},
        },
      ],
    });
    const response = await clear(
      request(
        "/hook",
        { response_id: "response", session_id: sessionId },
        hookKey
      ),
      params
    );
    expect(response.status).toBe(404);
    expect(db.writes).toEqual([]);
  });
  test("session sync cannot report success when its bound session is missing", async () => {
    database({
      form: [{ id: formId, fields: [] }],
      response: [
        { id: "response", form_id: formId, session_id: sessionId, raw: {} },
      ],
    });
    const response = await clear(
      request(
        "/hook",
        { response_id: "response", session_id: sessionId },
        hookKey
      ),
      params
    );
    expect(response.status).toBe(500);
  });
  test.each([
    ["clear", clear],
    ["index", index],
    ["notify", notify],
  ] as const)(
    "%s rejects an incorrect completion key before data access",
    async (_name, handler) => {
      const response = await handler(
        request(
          "/hook",
          { response_id: "response", session_id: sessionId },
          "incorrect-key"
        ),
        params
      );
      expect(response.status).toBe(403);
      expect(mocks.from).not.toHaveBeenCalled();
    }
  );
  test("notification reports a provider-returned error", async () => {
    database({
      form: [
        {
          id: formId,
          project_id: 1,
          title: "Form",
          fields: [],
          notification_respondent_email: {
            enabled: true,
            body_html_template: "Received",
          },
        },
      ],
      response: [
        {
          id: "response",
          form_id: formId,
          customer_id: "customer",
          raw: {},
          local_index: 1,
        },
      ],
      customer: [
        {
          uid: "customer",
          project_id: 1,
          email: "respondent@example.test",
          is_email_verified: true,
        },
      ],
    });
    mocks.send.mockResolvedValueOnce({
      data: null,
      error: { message: "provider unavailable" },
    });
    expect(
      (
        await notify(
          request("/hook", { response_id: "response" }, hookKey),
          params
        )
      ).status
    ).toBe(502);
  });
  test("completion transport includes its authority and fails on non-success", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      OnSubmit.clearsession({
        form_id: formId,
        response_id: "response",
        session_id: sessionId,
      })
    ).rejects.toThrow("Forms completion failed (503)");
    const headers = new Headers(fetch.mock.calls[0][1]?.headers);
    expect(headers.get("x-grida-s2s-key")).toBe(hookKey);
  });
});

describe("session file authority", () => {
  const context = {
    params: Promise.resolve({ session: sessionId, field: fieldId }),
  };
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
