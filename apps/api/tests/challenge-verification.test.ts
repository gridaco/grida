import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn<() => Promise<{ data: unknown; error: unknown }>>(),
  rpc: vi.fn<
    (
      name: string,
      args: unknown
    ) => Promise<{
      data: { state: Record<string, unknown> }[] | null;
      error: { message: string } | null;
    }>
  >(),
}));

vi.mock("../server/forms/db", () => ({
  service_role: { forms: { rpc: mocks.rpc }, ciam: { rpc: mocks.rpc } },
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
  mocks.context.mockResolvedValue({
    data: {
      session: { id: session, form_id: "form", raw: {}, customer_id: null },
      field: {
        id: field,
        form_id: "form",
        name: "__gf_customer_email",
        type: "challenge_email",
      },
      form: { id: "form", project_id: 1 },
    },
    error: null,
  });
});

describe("Forms OTP transaction response", () => {
  test("reports database failure without claiming verification success", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "private database failure" },
    });
    const response = await verify();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal error" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  test("maps a committed denial to 401 without a follow-up state write", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const response = await verify();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid or expired OTP" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  test("returns the transaction's persisted state and only supplies capability inputs", async () => {
    const state = {
      state: "challenge-success",
      email: "respondent@example.test",
      challenge_id: challenge,
      customer_uid: customer,
      verified_at: "2026-10-03T00:00:00Z",
    };
    mocks.rpc.mockResolvedValue({ data: [{ state }], error: null });
    const response = await verify();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("verify_email_otp", {
      p_session_id: session,
      p_field_id: field,
      p_challenge_id: challenge,
      p_otp: "123456",
    });
  });

  test.each([
    null,
    {},
    { challenge_id: challenge, otp: 123456 },
    { challenge_id: [], otp: "123456" },
  ])("rejects malformed input before the verifier", async (body) => {
    expect((await verify(body)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
