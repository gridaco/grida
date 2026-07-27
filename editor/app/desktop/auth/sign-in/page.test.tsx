import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, redirect, SignInCard } = vi.hoisted(() => ({
  getUser: vi.fn<
    () => Promise<{
      data: { user: { id: string } | null };
      error: { name?: string; status?: number } | null;
    }>
  >(),
  redirect: vi.fn<(url: string) => never>((url) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  SignInCard: vi.fn<() => null>(() => null),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

vi.mock("./_components/sign-in-card", () => ({ SignInCard }));

import DesktopSignInPage from "./page";

beforeEach(() => {
  getUser.mockReset();
  redirect.mockClear();
  SignInCard.mockClear();
});

describe("DesktopSignInPage", () => {
  it("hands an existing session to the fixed completion surface", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    await expect(
      DesktopSignInPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("REDIRECT:/desktop/auth/complete");
    expect(redirect).toHaveBeenCalledWith("/desktop/auth/complete");
  });

  it("renders the single sign-in card for a signed-out session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const element = await DesktopSignInPage({
      searchParams: Promise.resolve({ auth_error: "flow_state_expired" }),
    });

    expect(redirect).not.toHaveBeenCalled();
    expect(element.type).toBe(SignInCard);
    expect(element.props).toEqual({ authError: "flow_state_expired" });
  });

  it("does not present an auth-service outage as signed out", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", status: 0 },
    });

    await expect(
      DesktopSignInPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("temporarily unavailable");
    expect(SignInCard).not.toHaveBeenCalled();
  });
});
