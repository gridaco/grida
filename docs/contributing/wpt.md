# Contributing to Grida | Web Platform Tests

This guide covers how to run the upstream [web-platform-tests][wpt]
suite against Grida's `cg::htmlcss` renderer. It is relevant only if
you are working on the htmlcss renderer and want to validate against
the CSS spec; for day-to-day Chromium-parity work use the in-tree
refbrowser pipeline (see [cg-reftest skill][cg-reftest]).

Status: **PoC**. Reftest pair-matching works end-to-end. Testharness
and crashtest executors are not yet wired. Most tests fail — the goal
right now is to make the plumbing reliable, not to ship a pass rate.

[wpt]: https://web-platform-tests.org/
[cg-reftest]: ../../.agents/skills/cg-reftest/SKILL.md

## One-time setup

### 1. Clone the Grida WPT fork as a sibling

The WPT tree with Grida's product plugin lives at
[`gridaco/wpt`](https://github.com/gridaco/wpt). Clone it as a sibling
of the grida repo:

```sh
cd /path/to/grida/..  # parent of the grida/ checkout
git clone --depth=1 https://github.com/gridaco/wpt.git wpt
```

Layout after cloning:

```
Apps/grida/
├── grida/         # this repo
└── wpt/           # the fork
```

Do not use a random upstream WPT checkout — it lacks the `grida`
product registration.

That's it — `just wpt` handles build + binary path + report output.

## Run

From this repo:

```sh
just wpt css/css-transforms/2d-rotate-001.html  # one file (pilot test)
just wpt css/css-transforms/                    # one subsuite
just wpt                                        # all of css/ (default)
```

Expected output on the pilot: `SUITE_START` → `TEST_START` →
`TEST_END: FAIL, expected PASS`. The FAIL is not a setup error — it
means the pipeline ran end-to-end and cg's rendering of the pair did
not match within fuzzy tolerance. See the [primitives inventory][inventory]
for what feature gaps cause most of the fails.

[inventory]: https://github.com/gridaco/grida/issues <!-- TODO: link once checked in -->

Wide runs write a structured report to `target/wpt-report.json`. Mine
it with `jq`:

```sh
jq '.results | group_by(.status) | map({status: .[0].status, count: length})' \
   target/wpt-report.json
```

The plugin is reftest-only; `testharness`, `crashtest`, `wdspec`, and
`print-reftest` types warn "Unsupported test type" and are skipped.

### Under the hood

`just wpt` runs:

```sh
cargo build -p grida_wpt --release
cd ../wpt && ./wpt run \
    --binary=<repo>/target/release/grida_wpt \
    --log-wptreport=<repo>/target/wpt-report.json \
    --log-mach-level=info \
    grida <target>
```

Skip the recipe and call `./wpt run` directly if you need custom
flags (`--include-file`, `--repeat`, etc.).

## What the plugin does

Pipeline: `wptrunner` invokes `grida_wpt render --url <test_url> --out
<tmp>` once per reftest screenshot. Both `test.html` and `ref.html`
render through `cg::htmlcss`. Wptrunner's built-in
`RefTestImplementation` compares the two PNGs, honoring `<meta
name="fuzzy">` tolerances.

Source:

- **Rust side:** [`crates/grida_wpt/`](../../crates/grida_wpt/) in
  this repo. The `render` subcommand handles `--url` mode.
- **Python side:** `tools/wptrunner/wptrunner/browsers/grida.py` and
  `executors/executorgrida.py` in the fork. See `README-GRIDA.md` at
  the fork root for the exact list of changed files.

## Known gotchas

- **No `/etc/hosts` edits needed.** Our plugin's `env_options`
  hardcodes `server_host: 127.0.0.1` and the Python executor
  rewrites `web-platform.test:<port>` URLs to `127.0.0.1:<port>`
  before invoking `grida_wpt`. Do **not** pass `--enable-dns`;
  wptrunner has an unrelated bug where its TCP readiness probe
  cannot detect a UDP-only DNS server.
- **No auto-install of the binary.** Always pass `--binary=<path>`
  explicitly. Grida does not implement the `install_webdriver`
  hooks.
- **External stylesheets / images are not resolved.** `grida_wpt`
  fetches the test HTML but does not follow `<link
rel="stylesheet">` or `<img src>`. Tests that depend on external
  support files will mismatch until the adoption plan's P4 lands.

## Troubleshooting

**`Unknown product 'grida'`** → You are pointing at the wrong WPT
checkout. Confirm `git remote get-url origin` in `../wpt` is
`https://github.com/gridaco/wpt` (or a fork thereof).

**`Missing hosts file configuration`** → Same cause; the fork's
`tools/wpt/run.py` adds `grida` to the skip-list. If this error fires,
the fork is stale or the wrong clone.

**Tests CRASH with network error in stderr** → `wptserve` did not
start. Check for port conflicts on 8000–8003 / 8443–8446 / 9000.
`pkill -f "wpt serve"` and retry.

## Keeping the fork current

When upstream WPT drifts, rebase the Grida commit onto latest master
inside the fork:

```sh
cd ../wpt
git fetch upstream master   # add upstream remote first if needed
git rebase upstream/master
git push --force-with-lease origin master
```

Three patches to carry: `tools/wpt/run.py`, `tools/wpt/browser.py`,
`tools/wptrunner/wptrunner/products.py`. The two plugin files
(`grida.py`, `executorgrida.py`) are new, so rebase-clean.

## See also

- [grida_wpt crate README](../../crates/grida_wpt/README.md) — Rust
  side usage (including the refbrowser-pipeline use of `grida_wpt
render --suite`).
- [adoption plan](https://github.com/gridaco/grida/issues) <!-- TODO -->
  — strategic rationale for adopting WPT.
