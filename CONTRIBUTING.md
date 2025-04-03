## Running Locally

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

## Running backend (supabase) locally

- follow this [guide](https://supabase.io/docs/guides/local-development) to run supabase locally
  - supabase cli required (brew install supabase)
  - [docker desktop](https://docker.com) required

```bash
supabase start
supabase seed buckets
```

### Supabase Types

```bash
npx supabase gen types typescript --local \
  --schema public \
  --schema grida_g11n \
  --schema grida_x_supabase \
  --schema grida_sites \
  --schema grida_canvas \
  --schema grida_commerce \
  --schema grida_forms_secure \
  --schema grida_forms \
  --schema grida_storage \
  --schema grida_west \
  --schema grida_west_referral \
  > database-generated.types.ts
```

or (if you are a tier 1 contributor)

```bash
npx supabase gen types typescript \
  --project-id $PROJECT_REF \
  --schema public \
  --schema grida_g11n \
  --schema grida_x_supabase \
  --schema grida_sites \
  --schema grida_canvas \
  --schema grida_commerce \
  --schema grida_forms_secure \
  --schema grida_forms \
  --schema grida_storage \
  --schema grida_west \
  --schema grida_west_referral \
  > database-generated.types.ts
```

## Support

If you have any problem running the project locally or for any further information, please contact us via Slack.

- [joining our slack channel](https://grida.co/join-slack)
