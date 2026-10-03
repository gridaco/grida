# Translation catalogs

`<locale>/forms.json` is the canonical Forms copy. Edit text here once; the
[`@workspace/translations` package](../../packages/translations/README.md) embeds
the JSON into its build and exposes typed resource bindings.

Keep catalog keys consistent across locales. Preserve the existing `{{available}}`,
`{{form_title}}` and `{{response.idx}}` interpolation tokens unless their contract
is deliberately changed. Email verification currently owns its localized copy
inside [`@workspace/emails`](../../packages/emails/README.md); this move does not
introduce a different formatter or duplicate that copy into these catalogs.
