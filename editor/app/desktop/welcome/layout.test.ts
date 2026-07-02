/**
 * GRIDA-SEC-005 — the desktop welcome segment is the enforced sign-in gate.
 * Pins the redirect-when-signed-out / render-when-signed-in decision so an
 * inverted condition can't silently let anonymous users into the app.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser =
  vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const redirect = vi.fn<(url: string) => never>((url) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

import DesktopWelcomeLayout from "./layout";

beforeEach(() => {
  getUser.mockReset();
  redirect.mockClear();
});

describe("DesktopWelcomeLayout", () => {
  it("redirects to the sign-in gate when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(DesktopWelcomeLayout({ children: "content" })).rejects.toThrow(
      "REDIRECT:/desktop/auth/sign-in"
    );
    expect(redirect).toHaveBeenCalledWith("/desktop/auth/sign-in");
  });

  it("renders children when signed in", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const element = await DesktopWelcomeLayout({ children: "content" });
    expect(redirect).not.toHaveBeenCalled();
    expect(element).toBeTruthy();
  });
});
