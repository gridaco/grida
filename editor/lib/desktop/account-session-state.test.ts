import { describe, expect, it } from "vitest";
import { desktop_account_session } from "./account-session-state";

describe("desktop_account_session.classify", () => {
  it.each([
    [{ has_user: true, error: null }, "signed-in"],
    [{ has_user: false, error: null }, "signed-out"],
    [
      {
        has_user: false,
        error: { name: "AuthSessionMissingError", status: 400 },
      },
      "signed-out",
    ],
    [
      {
        has_user: false,
        error: { name: "AuthRetryableFetchError", status: 0 },
      },
      "unavailable",
    ],
    [{ has_user: false, error: { status: 400 } }, "signed-out"],
    [{ has_user: false, error: { status: 401 } }, "signed-out"],
    [{ has_user: false, error: { status: 403 } }, "signed-out"],
    [{ has_user: false, error: { status: 404 } }, "unavailable"],
    [{ has_user: false, error: { status: 408 } }, "unavailable"],
    [{ has_user: false, error: { status: 429 } }, "unavailable"],
    [{ has_user: false, error: { status: 503 } }, "unavailable"],
    [{ has_user: false, error: new Error("unknown") }, "unavailable"],
    [{ has_user: false, error: "unknown" }, "unavailable"],
  ] as const)("%o → %s", (input, expected) => {
    expect(desktop_account_session.classify(input)).toBe(expected);
  });
});
