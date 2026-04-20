# [grida.co/docs](https://grida.co/docs)

This website is built using [Docusaurus](https://docusaurus.io/).

## Source docs and translations

- Source docs live in the repository root under `/docs/**`.
- `/apps/docs/docs/**` is generated during docs setup and build.
- Locale files live in `translations/<locale>/` directories next to the source docs and are copied into Docusaurus i18n output.

## Shipping rules

- Publish docs once they are minimally meaningful.
- Use `draft: true` only for docs that are not yet meaningful enough to ship.
- Reserve `unlisted: true` for intentionally non-discoverable docs.
- Use `doc_tasks` to track follow-up work on publishable docs: `enhance`, `update`, `translate`.

### Running locally

```sh
pnpm install
pnpm start
# pnpm build
# visit http://localhost:3000/docs
```

## Contents

The docs content IS NOT SERVED under this directory.

Docs are synced from the root `./docs` directory.
