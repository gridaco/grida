import { describe, expect, test, vi } from "vitest";

const request = vi.hoisted(() => ({ language: null as string | null }));
const database = vi.hoisted(() => ({ forms: [] as string[] }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      request.language === null ? {} : { "accept-language": request.language }
    ),
}));
vi.mock("@/lib/supabase/server", () => ({
  service_role: {
    forms: {
      from: () => ({
        select: () => ({
          eq: (_key: string, formId: string) => ({
            single: async () => {
              database.forms.push(formId);
              return { data: formId === "missing" ? null : { lang: formId } };
            },
          }),
        }),
      }),
    },
  },
}));

import { getLocale } from "./server";
import { ssr_page_init_i18n } from "./ssr";

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

describe("Forms SSR translation", () => {
  test("keeps a form's language after another request initializes its translator", async () => {
    const [english, korean] = await Promise.all([
      ssr_page_init_i18n({ form_id: "en" }),
      ssr_page_init_i18n({ form_id: "ko" }),
    ]);
    const spanish = await ssr_page_init_i18n({ lng: "es" });
    expect(english("submit")).toBe("Submit");
    expect(korean("submit")).toBe("제출");
    expect(spanish("submit")).toBe("Enviar");
    expect(
      english("formcomplete.receipt01.h2", { form_title: "Example" })
    ).toBe("Receipt Confirmed - Example");
  });

  test("preserves the default language when a form document is missing", async () => {
    const t = await ssr_page_init_i18n({ form_id: "missing" });
    expect(t("submit")).toBe("Submit");
  });

  test("does not read a form document when a page supplies its language", async () => {
    database.forms.length = 0;
    const t = await ssr_page_init_i18n({ lng: "ko" });
    expect(t("submit")).toBe("제출");
    expect(database.forms).toEqual([]);
  });
});
