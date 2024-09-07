## Running Locally

> Note: this project may not work locally without the necessary environment variables and 3rd party service configurations (supabase for instance) (we do not have a docker image yet, so If you wish to contribute, please contact us or open an issue)

Otherwise, you can officially join our team by [joining our slack channel](https://grida.co/join-slack)

---

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
  --schema grida_g11n \
  --schema grida_x_supabase \
  --schema grida_sites \
  --schema grida_commerce \
  --schema grida_forms_secure \
  --schema grida_forms \
  > database.types.ts
```
