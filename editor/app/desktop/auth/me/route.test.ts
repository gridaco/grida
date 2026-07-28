// GRIDA-SEC-005 — account-state availability classification pins.
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn<
  () => Promise<{
    data: {
      user: {
        id: string;
        email?: string;
        user_metadata?: Record<string, unknown>;
      } | null;
    };
    error: { name?: string; status?: number } | null;
  }>
>();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

import { GET } from "./route";

beforeEach(() => {
  getUser.mockReset();
});

describe("GET /desktop/auth/me", () => {
  it("returns the signed-in account shape", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          email: "person@example.com",
          user_metadata: { full_name: "Person" },
        },
      },
      error: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "u1",
        email: "person@example.com",
        name: "Person",
        avatar_url: null,
      },
    });
  });

  it("treats an absent session as signed out", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", status: 400 },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user: null });
  });

  it.each([
    { name: "AuthRetryableFetchError", status: 0 },
    { name: "AuthApiError", status: 503 },
    { name: "UnknownAuthFailure" },
  ])(
    "does not misclassify an upstream failure as signed out",
    async (error) => {
      getUser.mockResolvedValue({ data: { user: null }, error });

      const response = await GET();

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "account_unavailable",
      });
    }
  );
});
