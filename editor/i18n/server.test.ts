import { describe, expect, test, vi } from "vitest";

const request = vi.hoisted(() => ({ language: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      request.language === null ? {} : { "accept-language": request.language }
    ),
}));

import { getLocale } from "./server";

describe("request language fallback", () => {
  test.each([null, "", "*", "not_a_locale"])(
    "uses the default for %s",
    async (header) => {
      request.language = header;
      expect(await getLocale(["en", "ko", "es"], "ko")).toBe("ko");
    }
  );
  test("retains valid language preferences after ignoring wildcards", async () => {
    request.language = "*, es;q=0.9, ko;q=0.5";
    expect(await getLocale(["en", "ko", "es"], "en")).toBe("es");
  });
  test("retains regional matching", async () => {
    request.language = "es-MX";
    expect(await getLocale(["en", "ko", "es"], "en")).toBe("es");
  });
});
