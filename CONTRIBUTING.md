# Contributing to Grida

---

First, clone the repo with git submodules (optional. using Github Desktop will automatically clone the submodules for you)

```bash
# clone the repo
git clone --recurse-submodules https://github.com/gridaco/grida
cd grida

# setup node & package manager
nvm use
corepack enable pnpm

# install just
brew install just

# install typos (typo checker)
brew install typos
```

## Rust / Canvas (Skia) prerequisites

Some Rust crates (e.g. the canvas backend) build Skia via `skia-bindings`, which requires `ninja` to be available on your system.

**macOS**

```bash
brew install ninja
ninja --version
```

**Ubuntu/Debian**

```bash
sudo apt-get update
sudo apt-get install -y ninja-build
ninja --version
```

Then, install the dependencies and run the development server:

```bash
# (1) install dependencies
pnpm install

# run all (not recommended)
pnpm turbo dev

# run specific app
pnpm dev:editor

# or simply..
cd editor
pnpm dev # (cwd:/editor)

# -----
# building
pnpm turbo build
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Packaging canvas wasm

```bash
just build canvas wasm
```

## Running backend (supabase) locally

- follow this [guide](https://supabase.io/docs/guides/local-development) to run supabase locally
  - supabase cli required (`brew install supabase/tap/supabase`)
  - [docker desktop](https://docker.com) required
- for Grida-specific Supabase setup (migrations, env, signing keys), see `supabase/README.md`.

## Support

If you have any problem running the project locally or for any further information, please contact us via Slack.

- [joining our slack channel](https://grida.co/join-slack)

**See Also**

- [AGENTS.md](./AGENTS.md) has a comprehensive list of the project structure and the purpose of each directory and file.
