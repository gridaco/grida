import { createHash } from "node:crypto";
import resources, {
  createFormsTranslator,
  getLocale,
  select_lang,
  supported_languages,
} from "./forms";
import fingerprints from "./catalog-fingerprints.json";

function leaves(value: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof item === "string"
        ? [[path, item]]
        : Object.entries(leaves(item, path));
    })
  );
}

describe("Forms catalogs", () => {
  test("preserves all thirteen locales", () => {
    expect(supported_languages).toEqual([
      "en",
      "es",
      "ko",
      "ja",
      "zh",
      "fr",
      "pt",
      "it",
      "de",
      "ru",
      "ar",
      "hi",
      "nl",
    ]);
    expect(Object.keys(fingerprints)).toEqual(supported_languages);
  });

  test.each(supported_languages)(
    "preserves %s copy, keys and placeholders",
    (language) => {
      const translation = resources[language].translation;
      // These fingerprints capture the catalog before its source was relocated.
      expect(
        createHash("sha256").update(JSON.stringify(translation)).digest("hex")
      ).toBe(fingerprints[language]);
      const messages = leaves(translation);
      expect(Object.keys(messages).sort()).toEqual(
        Object.keys(leaves(resources.en.translation)).sort()
      );
      const placeholders = Object.fromEntries(
        Object.entries(messages)
          .map(([key, message]) => [
            key,
            [...message.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1]),
          ])
          .filter(([, tokens]) => (tokens as string[]).length > 0)
      );
      expect(placeholders).toEqual({
        left_in_stock: ["available"],
        "formcomplete.default.h1": ["form_title"],
        "formcomplete.receipt01.h1": ["response.idx"],
        "formcomplete.receipt01.h2": ["form_title"],
      });
    }
  );
});

describe("locale selection", () => {
  test.each([undefined, null, 7, {}, "", "fr", "ko-KR"])(
    "uses the configured exact-language fallback for %s",
    (language) => expect(select_lang(language, ["en", "ko"], "en")).toBe("en")
  );
  test("matches supported language names case-insensitively", () => {
    expect(select_lang("KO", ["en", "ko"], "en")).toBe("ko");
  });
  test.each([null, "", "*", "not_a_locale"])(
    "falls back for an unusable language header: %s",
    (value) => {
      const headers = new Headers(
        value === null ? {} : { "accept-language": value }
      );
      expect(getLocale(headers, ["en", "ko", "es"], "ko")).toBe("ko");
    }
  );
  test("keeps valid weighted preferences and regional matching", () => {
    expect(
      getLocale(
        new Headers({ "accept-language": "*, es;q=0.9, ko;q=0.5" }),
        ["en", "ko", "es"],
        "en"
      )
    ).toBe("es");
    expect(
      getLocale(
        new Headers({ "accept-language": "es-MX" }),
        ["en", "ko", "es"],
        "en"
      )
    ).toBe("es");
  });
});

describe("isolated Forms translation", () => {
  test("keeps each language fixed across interleaved requests", async () => {
    const [english, korean] = await Promise.all([
      createFormsTranslator("en"),
      createFormsTranslator("ko"),
    ]);
    const spanish = await createFormsTranslator("es");
    expect(english("left_in_stock", { available: 3 })).toBe("3 left");
    expect(korean("left_in_stock", { available: 3 })).toBe("3개 남음");
    expect(spanish("left_in_stock", { available: 3 })).toBe("3 restantes");
    expect(english("left_in_stock", { available: 4 })).toBe("4 left");
  });
  test("falls back to English and retains regional language lookup", async () => {
    expect((await createFormsTranslator("unsupported"))("submit")).toBe(
      "Submit"
    );
    expect((await createFormsTranslator("es-MX"))("submit")).toBe(
      resources.es.translation.submit
    );
    expect((await createFormsTranslator())("submit")).toBe("Submit");
  });
  test("retains nested placeholder interpolation and escaping", async () => {
    const t = await createFormsTranslator("en");
    expect(t("formcomplete.receipt01.h1", { response: { idx: 42 } })).toBe(
      "42"
    );
    expect(t("formcomplete.default.h1", { form_title: "<script>" })).toBe(
      "&lt;script&gt;"
    );
  });
});
