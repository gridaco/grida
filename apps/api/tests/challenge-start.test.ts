import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issue: vi.fn<
    (
      name: string,
      args: unknown
    ) => Promise<{
      data: string | null;
      error: { code: string } | null;
    }>
  >(),
  persist: vi.fn<
    (
      name: string,
      args: unknown
    ) => Promise<{
      data: null;
      error: { message: string } | null;
    }>
  >(),
  send: vi.fn<
    (email: unknown) => Promise<{
      data: { id: string } | null;
      error: { message: string } | null;
    }>
  >(),
  from: vi.fn<(table: string) => unknown>(),
}));
vi.mock("../server/forms/db", () => ({
  service_role: {
    ciam: { rpc: mocks.issue },
    forms: { from: mocks.from, rpc: mocks.persist },
    workspace: { from: mocks.from },
    www: { from: mocks.from },
  },
}));
vi.mock("../server/forms/clients/resend/index", () => ({
  resend: { emails: { send: mocks.send } },
}));
vi.mock("../server/forms/handlers/challenge/context", async (original) => ({
  ...(await original<
    typeof import("../server/forms/handlers/challenge/context")
  >()),
  loadChallengeEmailContext: async () => ({
    data: {
      field: { type: "challenge_email" },
      form: { id: "form", project_id: 1 },
    },
    error: null,
  }),
}));

import { POST } from "../server/forms/handlers/challenge/start";

function start(email: unknown = "respondent@example.test") {
  return POST(
    new Request("http://localhost/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
    { session: "session", field: "field" }
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.issue.mockResolvedValue({ data: "challenge", error: null });
  mocks.persist.mockResolvedValue({ data: null, error: null });
  mocks.send.mockResolvedValue({ data: { id: "mail" }, error: null });
  mocks.from.mockImplementation((table: string) => {
    const result = {
      data:
        table === "customer"
          ? [{ uid: "customer" }]
          : table === "form_document"
            ? { lang: "en" }
            : [],
      error: null,
    };
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      single: async () => result,
      // oxlint-disable-next-line unicorn/no-thenable -- Supabase queries are awaitable.
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return query;
  });
});

test("issuance failure does not send email or replace state", async () => {
  mocks.issue.mockResolvedValue({ data: null, error: { code: "P0001" } });
  const response = await start();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "unable to start challenge" });
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.persist).not.toHaveBeenCalled();
});

test.each([null, [], 123456])(
  "rejects non-string email input",
  async (email) => {
    expect((await start(email)).status).toBe(400);
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  }
);

test("a failed state write cannot be reported as a started challenge", async () => {
  mocks.persist.mockResolvedValue({
    data: null,
    error: { message: "private failure" },
  });
  const response = await start();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "unable to start challenge" });
});
