# @workspace/translations

Private workspace translation catalogs and locale utilities. The Forms catalog
has one editable source: [`data/translations`](../../data/translations/README.md).
The build embeds those JSON files into the package; deployed applications do not
read repository files at runtime. Turbo inputs include the external catalog tree.

```ts
import resources, {
  createFormsTranslator,
  getLocale,
  select_lang,
  type Translation,
  type FormsLocale,
} from "@workspace/translations/forms";

const language = getLocale(request.headers, ["en", "ko", "es"], "en");
const t = await createFormsTranslator(language);
const label = t("left_in_stock", { available: 3 });
```

`resources` retains the i18next `{ locale: { translation } }` shape. Treat the
catalog as immutable. Browser providers may create their own i18next instances;
server calls should use `createFormsTranslator`, which creates an isolated
instance and returns a fixed translator. Unsupported languages fall back to
English; i18next regional lookup and interpolation remain intact.

`select_lang` selects an exact supported language case-insensitively, otherwise
the explicit fallback. `getLocale` matches an explicit `Headers` value against
supported locales, including regional preferences; it ignores unusable tags and
wildcards before matching. Neither helper reads framework or environment state.

The tests preserve locale coverage, catalog keys, interpolation placeholders,
copy fingerprints, locale fallback and request isolation. Fingerprints lock the
initial catalog during relocation; update them deliberately when copy changes.

## Boundaries

No application imports, database access, credentials, locale discovery from
ambient state, delivery clients or per-request global state. Product schemas and
authorization do not belong here. This package does not translate unrelated
product surfaces or introduce a new message syntax.
