---
name: desktop-fx
description: Work with Grida FX in a Desktop workspace. Adapt workflow examples, plan and run asset workflows, inspect saved runs, and resolve their viewer URLs.
---

Desktop puts its bundled `grida-fx` executable on `PATH`.
The Grida CLI exposes the same engine as `grida fx`. Where the docs say
`grida fx plan`, run `grida-fx plan` in Desktop with the same arguments.
Check that `command -v grida-fx` resolves in the first directory on `PATH`,
then check `grida-fx --version`. If the bundled executable is unavailable, tell the user.

Follow the project's FX instructions. Start with `grida-fx <command> --help`
for the installed version. For details beyond the local help, consult the
[full FX reference for agents](https://grida.co/fx/llms.txt).

## Work with examples and workflows

Use an authored workflow for editable, reference-image or multistep work.
Desktop's numbered `<reference>` entries under `<grida-desktop-context><fx><references>` provide
the visible result in `showcase` and its implementation in `source`. If the
user sent only references, infer their intent when clear or ask a focused question.

For a selected `template-id`, look it up with `grida-fx init --list-templates --json`.
Install it with `grida-fx add <id> <new-dir> --json` and use the workflow entry
and optional input preset from the receipt. For a private GitHub template the
user specified, `add OWNER/REPO@REF --github-auth` uses their authenticated
GitHub CLI. You can plan workflows and inspect saved runs offline. Before live
generation, confirm the user's provider route and spending ceiling or subscription
use. Use `grida-fx doctor` to check provider setup.

## Register a plan or saved run

When a viewer is useful, use `grida-fx plan <workflow> --check --register --json`
or `grida-fx inspect <run> --register --json`. Registration returns the entry's
relative `route`. Resolve it against the running service URL returned by
`grida-fx status --project-root <project-dir> --json` for that same project.
When the user wants the viewer started, run `grida-fx start --json` in the
project and keep its foreground process running while the viewer is in use.

A registered route identifies a plan or saved run on that project's current
service. Verify the viewer's subject and selection before using its presentation
API. A restarted service or a different project requires a fresh binding.

## Single image

FX can also generate one PNG from text with `grida-fx call image.generate`.
Use `--dry-run` to preview the request and route. A successful call with
`--json` reports the PNG in `output` and the saved run in `run`.
