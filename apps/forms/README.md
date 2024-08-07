# Grida Forms ([forms.grida.co](https://forms.grida.co))

## Getting Started

First, run the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Supabase Types

```bash
npx supabase gen types --lang=typescript \
  --project-id "$PROJECT_REF" \
  --schema public \
  --schema grida_x_supabase \
  --schema grida_sites \
  --schema grida_commerce \
  --schema grida_forms_secure \
  --schema grida_forms \
  > database.types.ts
```

## Grida Forms Client Library

Grida Forms Client JS is available at [gridaco/forms](https://github.com/gridaco/forms)

<!--  -->
