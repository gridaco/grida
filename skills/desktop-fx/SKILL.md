---
name: desktop-fx
description: Generate a single image from a text prompt in a Desktop workspace, including when the chat has no image generation tool. Also use Grida FX to build editable workflows from examples, inspect saved runs, and present results.
---

Run `grida-fx` in the workspace through the ordinary command tool. Check that
`command -v grida-fx` resolves in the first directory on `PATH`, then check
`grida-fx --version`. If the bundled executable is unavailable, tell the user.
Follow the project's FX instructions and use command-specific `--help` for the installed version.

## Generate one image

For a text-to-image request, `call image.generate` produces one PNG and a saved
run directly. Use the nearest `fx.yaml`'s image route when configured. Outside a
project, supply a qualified route the user wants. For example, preview an
image request for the user's signed-in Codex CLI.

```sh
grida-fx call image.generate --prompt 'A red kite above a foggy hill' --route imagegen@codex --dry-run --json
```

The preview reports the route, forecast and ceiling. Resolving an unfamiliar
provider model may need network access. To generate, replace `--dry-run`
with `--live`. Use the user's Full access selection and
authorization for the chosen route. A metered route needs an agreed
`--max-usd` or project budget. Codex and Grok Build routes use the user's
own signed-in subscriptions. Use `grida-fx doctor` to diagnose setup while
leaving credential values in their configured sources.

Read `status`, `output` and `run` from the JSON result. On success, give the
user the PNG directly. The FX 0.11.0 viewer cannot display a one-shot run's
graph. To deliver a named copy, add `--out` with an unused filename
in an existing workspace directory on the generation command. To diagnose
failure, inspect the exact run folder when returned. If only delivery failed,
use the saved `artifact`. Leave provider retries to FX.

## Work with examples and workflows

Use an authored workflow for editable, reference-image or multistep work.
Desktop's numbered `<reference>` entries under `<grida-desktop-context><fx><references>` provide
the visible result in `showcase` and its implementation in `source`. If the
user sent only references, infer their intent when clear or ask a focused question.

For a selected `template-id`, look it up with `grida-fx init --list-templates --json`.
Install it with `grida-fx add <id> <new-dir> --json` and use the workflow entry
and optional input preset from the receipt. For a private GitHub template the
user specified, `add OWNER/REPO@REF --github-auth` uses their authenticated
GitHub CLI. Downloads and provider calls require Full access. Offline planning
and saved run inspection work under Default access.

## Present an authored workflow's plan or saved run

When a viewer is useful, use `grida-fx plan <workflow> --check --register --json`
or `grida-fx inspect <run> --register --json`. Registration returns the entry's
relative `route`. Resolve it against the running service URL returned by
`grida-fx status --project-root <project-dir> --json` for that same project.
When the user wants the viewer started, run `grida-fx start --json` in the
project with Full access and retain its foreground process.

Open the resulting URL with `surface_open`. Use `browser_snapshot` to identify
the tab and current document, then `browser_evaluate` with that document ID to
read the viewer's context. Verify the subject and selection before using its
presentation API or telling the user what appeared.
