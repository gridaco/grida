# MEASURE — how the engine proves it is fast, and who asks

Performance is not one question, so it is not one tool. It splits along a hard
line: **what a machine can measure alone, and what needs a human.** The whole
discipline is to know which axis a symptom lives on and reach for the matching
tool — never the wrong one. This session cost us a full detour because render
_work_ was measured (headless, green) while the felt lag lived in the _present
path_ — a different axis entirely, invisible to those tools. This doc draws the
line so we don't cross it again.

## The four axes

| axis              | the question                                    | tool                                                         | automated?                            | human?            |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------- | ----------------- |
| **work**          | is the engine _doing_ too much per frame?       | `bin/probe` (CPU raster), `bin/probe_gpu` (headless GL)      | yes — headless, deterministic         | none              |
| **correctness**   | did an optimization change a pixel?             | `bin/gate` → `gate_diff` (L1 drawlist ==, L2 raster byte ==) | yes — headless, deterministic         | none              |
| **feel / pacing** | does it _stutter_ or _lag_ in a real window?    | the **auxiliary frame log** (below)                          | no — needs a real window + real input | runs + reviews    |
| **input→photon**  | does the photon feel _instant_ after the input? | — (a human eye, or a hardware latency rig)                   | **no — not software-measurable**      | is the instrument |

The top two are the daily loop: fast, repeatable, no one in the room. The bottom
two are the subject of this doc — the axes where a machine cannot stand in for a
person, and where reaching for a tool has a human cost.

## The automated loop (axes 1–2) — the default

Almost all perf work is _reducing work_ and _proving it still renders the same
pixels_. Both are fully headless and belong in the tight iteration loop:

- **`probe`** — deterministic CPU raster of scenario scenes (view / mutation /
  animation axes), per-stage (`resolve`/`build`/`execute`), p50–p99
  distributions, JSON baselines, panicking audit-guards. The always-on
  regression detector.
- **`probe_gpu`** — headless surfaceless-GL, real `flush_and_submit` wall time.
  The escalation for the two wins whose value is a persistent GPU texture (scene
  cache, layerization), where CPU raster would report the wrong _sign_.
- **`gate` / `gate_diff`** — the oracle law: every optimization ships a
  differential proving `optimized == reference`, byte-identical. No fast-but-
  wrong compositor ever lands.

If a question can be answered here, it **must** be — a human is never spent on
what a machine can settle.

## The auxiliary channel (axis 3) — human-in-the-loop, on demand

Some symptoms only exist in a real window: frame **pacing** (the gap _between_
draws, not the work _inside_ one), present-queue depth, redraw scheduling. No
headless probe sees them — there is no display, no vsync, no compositor. For
these, and **only** these, we deliberately spend a human.

**The instrument** is the live spike, opt-in behind an env var so its per-frame
file I/O never taxes a normal run:

```sh
ANCHOR_FRAMELOG=1 cargo run --release   # in model-v2/a/spike-canvas
# …interact (pan / zoom / drag) to reproduce the felt symptom, then kill it.
# Inspect the log — the human runs, the reviewer reads:
cat /tmp/anchor-spike-frames.log
```

Each line is one real frame, flushed immediately so a hard kill mid-gesture
still preserves it:

```
f1234   gap    8.01ms ( 124.8fps)  draw   1.90 = res 0.02 scene 0.31 flush 0.44 egui 0.61 gpu 0.52 vsync 0.00  | pan=1 drag=0 cursor=(812,410) damage=0 zoom=1.00
```

- **`gap`** — wall time since the previous frame. This is the **true fps** and
  the true judder signal: it counts time spent _outside_ `draw()` (event
  scheduling, present-queue waits) that per-stage numbers structurally cannot.
  Read its _distribution_, not its mean — 125fps median with 35ms spikes still
  _feels_ like 30. Judder is variance, and variance is a number.
- **`draw = res + scene + flush + egui + gpu + vsync`** — the per-stage split of
  our own frame. `gpu` is a real `glFinish` (blocks until the GPU is actually
  done), so whatever `vsync` (the raw `swap_buffers`) spends _after_ it is pure
  display-pacing idle, **not our cost**. This split is the one that answers "are
  _we_ slow, or is the display pacing us?" — a raw swap wall only ever shows
  multiples of the refresh interval and hides the truth.
- **`pan` / `drag` / `cursor` / `damage` / `zoom`** — the gesture context, so a
  bad frame correlates to what the hand was doing.

**When to reach for it:** only when a felt symptom (stutter, lag) cannot be
reproduced headlessly. It is a **bridge, not the loop** — a way for a person to
_show_ the engine a symptom the automated tools are blind to, once, so it can be
diagnosed and then chased with a proxy. It is not how we iterate day to day.

## The hard limit (axis 4) — named so we never fool ourselves

**Input-to-photon latency cannot be measured in software.** The lag that matters
— finger moves, glass updates — accrues in the OS compositor and the display
_after_ `swap_buffers` returns, where no timer of ours reaches. Every serious
measurement of it (NVIDIA LDAT, the research literature) puts a **photodiode or
high-speed camera on the physical screen**, triggered by a known input. So this
axis has an irreducible human/hardware core:

- **today:** a human glance — "does panning feel tight now?" — is the
  instrument. That is not a gap in our tooling; it is the nature of the quantity.
- **if we ever want it automated:** a hardware latency rig (a photodiode on the
  panel + a scripted input trigger) — a real but bounded project, not a timer we
  forgot to add.

The frame log reaches the _app-side_ boundary (input event → present submit);
the last hop to the photon is the human's. Green headless gates say the engine
is doing little work and drawing correct pixels — they say **nothing** about how
it feels. Keeping this axis explicit is what stops us mistaking one for the other.

## Discipline

- **Pick the axis for the symptom.** "Too much work" → `probe`. "Wrong pixel" →
  `gate_diff`. "Stutters" → the frame log. "Doesn't feel instant" → the human
  glance. Measuring the wrong axis is the failure that cost us a round.
- **The human channel is opt-in and rare.** `ANCHOR_FRAMELOG` is off by default;
  reaching for a person is a cost, spent only when a machine provably can't.
- **Green ≠ good feel.** Axes 1–2 and axes 3–4 are orthogonal. Never let a green
  gate stand in for a feel check, or a good feel excuse a work regression.

### Worked example — the render-on-demand fix (this session)

Headless probes were green; the owner reported panning "painfully slow." The
frame log (axis 3) settled it: throughput was **125fps median** — not the
sub-30 it _felt_ — so the symptom was pacing + latency, not work. The `gap`
column plus the continuous-redraw pattern pointed at the app rendering every
frame and racing vsync into a deep present queue. The fix (render-on-demand:
draw only on real input) dropped idle frames **466 → 2**, verified headlessly —
and the human glance (axis 4) confirmed the feel: _"its butter now."_ Four axes,
each doing the one job the others can't.

### The one automation still owed

The frame log is manual: a human runs, interacts, kills; the reviewer reads the
file. The named next step is to **formalize it** — a scripted `--scenario`
mode that drives a deterministic pan/zoom/mutate through the _real_ frame loop,
emits the same per-frame breakdown as JSON with pacing metrics (gap p99,
variance, frames-over-budget), and exits. That turns axis 3 into a repeatable,
baseline-able tool (a window flashes, but no human _input_ is needed) — leaving
only axis 4 as irreducibly human. Until then, axis 3 stays the manual bridge
this doc describes.
