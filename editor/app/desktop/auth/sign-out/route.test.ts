// GRIDA-SEC-005 — non-navigating same-origin sign-out pins.
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn<() => Promise<{ error: { message: string } | null }>>();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut } }),
}));

import { POST } from "./route";

beforeEach(() => {
  signOut.mockReset();
});

describe("POST /desktop/auth/sign-out", () => {
  it("returns a non-navigating 204 after the cookie session is cleared", async () => {
    signOut.mockResolvedValue({ error: null });

    const response = await POST(nativeSignOutRequest());

    expect(response.status).toBe(204);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed when Supabase does not clear the session", async () => {
    signOut.mockResolvedValue({ error: { message: "unavailable" } });

    const response = await POST(nativeSignOutRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "sign_out_failed",
    });
  });

  it.each([
    [
      "renderer-shaped request with a copied intent",
      {
        "sec-grida-desktop-account-session": "sign-out",
        origin: "https://grida.co",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
      },
    ],
    [
      "missing native intent",
      {
        "sec-fetch-site": "none",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-dest": "empty",
      },
    ],
    [
      "incomplete fetch metadata",
      {
        "sec-grida-desktop-account-session": "sign-out",
        "sec-fetch-site": "none",
      },
    ],
  ])(
    "refuses %s before touching the cookie session",
    async (_label, headers) => {
      const response = await POST(
        new Request("https://grida.co/desktop/auth/sign-out", {
          method: "POST",
          headers,
        })
      );

      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        error: "native_sign_out_required",
      });
      expect(signOut).not.toHaveBeenCalled();
    }
  );
});

function nativeSignOutRequest(): Request {
  return new Request("https://grida.co/desktop/auth/sign-out", {
    method: "POST",
    headers: {
      "sec-grida-desktop-account-session": "sign-out",
      "sec-fetch-site": "none",
      "sec-fetch-mode": "no-cors",
      "sec-fetch-dest": "empty",
    },
  });
}
