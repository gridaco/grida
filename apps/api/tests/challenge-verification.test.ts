import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const bind =
    vi.fn<(column: string, value: string) => Promise<{ error: null }>>();
  return {
    context: vi.fn<() => Promise<{ data: unknown; error: unknown }>>(),
    verify: vi.fn<
      (
        name: string,
        args: unknown
      ) => Promise<{
        data: { customer_uid: string; project_id: number }[] | null;
        error: { message: string } | null;
      }>
    >(),
    persist: vi.fn<(name: string, args: unknown) => Promise<{ error: null }>>(),
    update: vi.fn<(value: { customer_id: string }) => { eq: typeof bind }>(),
    bind,
  };
});

vi.mock("../server/forms/db", () => ({
  service_role: {
    forms: {
      rpc: mocks.persist,
      from: () => ({ update: mocks.update }),
    },
    ciam: { rpc: mocks.verify },
  },
}));
vi.mock("../server/forms/handlers/challenge/context", async (original) => ({
  ...(await original<
    typeof import("../server/forms/handlers/challenge/context")
  >()),
  loadChallengeEmailContext: mocks.context,
}));

import { POST } from "../server/forms/handlers/challenge/verify";

const session = "10000000-0000-4000-8000-000000000001";
const field = "20000000-0000-4000-8000-000000000001";
const challenge = "30000000-0000-4000-8000-000000000001";
const customer = "40000000-0000-4000-8000-000000000001";
const key = `__challenge_email__${field}`;
const prior = {
  state: "challenge-session-started",
  email: "respondent@example.test",
  challenge_id: challenge,
  expires_at: null,
  verified_at: null,
  customer_uid: null,
};

function context(name = "__gf_customer_email") {
  return {
    data: {
      session: {
        id: session,
        form_id: "form",
        raw: { [key]: prior },
        customer_id: null,
      },
      field: { id: field, form_id: "form", name, type: "challenge_email" },
      form: { id: "form", project_id: 1 },
    },
    error: null,
  };
}

function verify(body: unknown = { challenge_id: challenge, otp: "123456" }) {
  return POST(
    new Request("http://localhost/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { session, field }
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue(context());
  mocks.verify.mockResolvedValue({
    data: [{ customer_uid: customer, project_id: 1 }],
    error: null,
  });
  mocks.persist.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: mocks.bind });
  mocks.bind.mockResolvedValue({ error: null });
});

describe("Forms verification with the existing CIAM RPC", () => {
  test.each([
    { data: null, error: { message: "invalid" } },
    { data: [], error: null },
  ])("denies a rejected or empty verification result", async (result) => {
    mocks.verify.mockResolvedValue(result);
    const response = await verify();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid or expired OTP" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledExactlyOnceWith(
      "set_response_session_field_value",
      {
        session_id: session,
        key,
        value: { ...prior, state: "challenge-failed" },
      }
    );
  });

  test("uses the existing verifier and separately binds the identity and success state", async () => {
    const response = await verify();
    expect(response.status).toBe(200);
    const state = {
      ...prior,
      state: "challenge-success",
      customer_uid: customer,
      verified_at: expect.any(String),
    };
    expect(await response.json()).toEqual({ state });
    expect(mocks.verify).toHaveBeenCalledExactlyOnceWith(
      "verify_customer_otp_and_create_session",
      { p_challenge_id: challenge, p_otp: "123456", p_session_ttl_seconds: 0 }
    );
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      customer_id: customer,
    });
    expect(mocks.bind).toHaveBeenCalledExactlyOnceWith("id", session);
    expect(mocks.persist).toHaveBeenCalledExactlyOnceWith(
      "set_response_session_field_value",
      { session_id: session, key, value: state }
    );
  });

  test("verification of a regular email field does not bind the session identity", async () => {
    mocks.context.mockResolvedValue(context("contact"));
    expect((await verify()).status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledTimes(1);
  });

  test("rejects a different issued challenge before invoking the verifier", async () => {
    const response = await verify({
      challenge_id: "30000000-0000-4000-8000-000000000002",
      otp: "123456",
    });
    expect(response.status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test("rejects a returned foreign project before binding session state", async () => {
    mocks.verify.mockResolvedValue({
      data: [{ customer_uid: customer, project_id: 2 }],
      error: null,
    });
    expect((await verify()).status).toBe(500);
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test.each([
    null,
    {},
    { challenge_id: challenge, otp: 123456 },
    { challenge_id: [], otp: "123456" },
    { challenge_id: "not-a-uuid", otp: "123456" },
    { challenge_id: challenge, otp: "12345" },
  ])("rejects malformed input before the verifier", async (body) => {
    expect((await verify(body)).status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
