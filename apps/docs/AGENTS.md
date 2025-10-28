# Grida Docs - AI Agent Guide

## Important: Document Source Location

**DO NOT edit files under `apps/docs/docs/` directory directly!**

The documentation content is **NOT** maintained in `apps/docs/docs/`. Instead:

- **Source of Truth**: `/docs/` (root directory)
- **Build Destination**: `/apps/docs/docs/` (auto-generated, overwritten on build)

### How it works

The build process (`pnpm content:setup` or `pnpm build`) runs scripts that:

1. Copy all documentation from `/docs/` → `/apps/docs/docs/`
2. Process translations from `translations/` subdirectories
3. Build the Docusaurus site

See:

- `scripts/postinstall.js` - Entry point
- `scripts/setup-docs.js` - Setup orchestrator
- `scripts/docs-site-gen/copy-docs.js` - Copies from root `/docs` to `apps/docs/docs/`
- `scripts/docs-site-gen/copy-translations.js` - Handles translations

### When fixing documentation issues

1. **Always edit files in `/docs/`** (root directory)
2. Never edit files in `apps/docs/docs/` (they will be overwritten)
3. Run `pnpm build` to test your changes
4. The build will copy your changes from `/docs/` to `apps/docs/docs/`

### MDX/Markdown Syntax Issues

When fixing MDX compilation errors:

- Angle-bracketed URLs like `<https://example.com>` break MDX parsing
- Use plain URLs: `https://example.com` or markdown links: `[text](url)`
- MDX reserves `<>` for JSX/HTML tags only
