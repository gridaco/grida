## Running Locally

> Note: this project may not work locally without the necessary environment variables and 3rd party service configurations (supabase for instance) (we do not have a docker image yet, so If you wish to contribute, please contact us or open an issue)

Otherwise, you can officially join our team by [joining our slack channel](https://grida.co/join-slack)

---

First, clone the repo with git submodules

```
git clone --recurse-submodules https://github.com/gridaco/grida
cd grida
```

**Tip**

If you are not familiar with git submodules, you can simply use the Github Desktop app to clone the repo and it will automatically clone the submodules for you.

Then, install the dependencies and run the development server:

```bash
pnpm install
cd /path/to/package
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Insiders

Currently, our backend, supabase is not configured to run locally, it's not possible for you to properly run the project that requires the backend. - For further information, please contact us via Slack.

### Supabase Types

```bash
npx supabase gen types --lang=typescript \
  --project-id "$PROJECT_REF" \
  --schema public \
  --schema grida_g11n \
  --schema grida_x_supabase \
  --schema grida_sites \
  --schema grida_canvas \
  --schema grida_commerce \
  --schema grida_forms_secure \
  --schema grida_forms \
  > database.types.ts
```
