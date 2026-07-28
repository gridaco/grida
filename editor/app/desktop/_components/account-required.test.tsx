import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, redirect } = vi.hoisted(() => ({
  getUser: vi.fn<
    () => Promise<{
      data: { user: { id: string } | null };
      error: { name?: string; status?: number } | null;
    }>
  >(),
  redirect: vi.fn<(url: string) => never>((url) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("next/navigation", () => ({ redirect }));

import { DesktopAccountRequired } from "./account-required";

beforeEach(() => {
  getUser.mockReset();
  redirect.mockClear();
});

describe("DesktopAccountRequired", () => {
  it("renders only for an authenticated account", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    const element = await DesktopAccountRequired({ children: "content" });

    expect(element.props.children).toBe("content");
  });

  it("redirects a missing session to sign in", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", status: 400 },
    });

    await expect(
      DesktopAccountRequired({ children: "content" })
    ).rejects.toThrow("REDIRECT:/desktop/auth/sign-in");
  });

  it("fails closed without turning an outage into sign-out", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", status: 0 },
    });

    await expect(
      DesktopAccountRequired({ children: "content" })
    ).rejects.toThrow("temporarily unavailable");
    expect(redirect).not.toHaveBeenCalled();
  });
});
