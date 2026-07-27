/**
 * The required Grida-account gate precedes first-run onboarding.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser =
  vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const redirect = vi.fn<(url: string) => never>((url) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

import DesktopOnboardingLayout from "./layout";

beforeEach(() => {
  getUser.mockReset();
  redirect.mockClear();
});

describe("DesktopOnboardingLayout", () => {
  it("redirects signed-out users to the first-run sign-in gate", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(
      DesktopOnboardingLayout({ children: "content" })
    ).rejects.toThrow("REDIRECT:/desktop/auth/sign-in");
  });

  it("renders onboarding after Grida authentication", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const element = await DesktopOnboardingLayout({ children: "content" });
    expect(redirect).not.toHaveBeenCalled();
    expect(element).toBeTruthy();
  });
});
