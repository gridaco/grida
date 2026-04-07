---
title: "Chromium Compositor Scheduler"
format: md
tags:
  - internal
  - research
  - chromium
  - compositing
  - performance
---

# Chromium Compositor Scheduler

The scheduler orchestrates the frame production pipeline. It receives
vsync-aligned BeginFrame signals, decides when to request main-thread work,
when to draw, and when to skip frames. It mediates between the main thread
(which produces content) and the impl thread (which rasterizes and draws).

For the overall pipeline see
[compositor-architecture.md](./compositor-architecture.md). For how damage
tracking feeds into frame decisions see
[damage-tracking.md](./damage-tracking.md).

---

## The Three-Thread Model

| Thread         | Role                                                            | Key Class                |
| -------------- | --------------------------------------------------------------- | ------------------------ |
| Main thread    | Blink paint, layout, JavaScript. Produces `DisplayItemList`.    | `ProxyMain`              |
| Impl thread    | Manages layer tree, schedules raster, builds compositor frames. | `ProxyImpl`, `Scheduler` |
| Worker threads | Tile rasterization (up to 32 concurrent tasks).                 | `TaskGraphRunner`        |

The `Scheduler` runs on the impl thread and is the sole decision-maker for
frame timing. It queries the `SchedulerStateMachine` for what action to
take next.

Source: `cc/scheduler/scheduler.h`, `cc/trees/proxy_impl.cc`

---

## BeginFrame Sources

The scheduler subscribes to a `BeginFrameSource` which produces
vsync-aligned timing signals. Three implementations exist:

| Source                       | Behavior                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| `DelayBasedBeginFrameSource` | Timer-based, locked to an external vsync interval           |
| `BackToBackBeginFrameSource` | Fires as soon as the previous frame is acknowledged         |
| `ExternalBeginFrameSource`   | Ticked manually (used for cross-process frame coordination) |

The scheduler subscribes/unsubscribes based on whether a frame is needed
(`ShouldSubscribeToBeginFrames()`). When idle (no damage, no pending
work), the scheduler unsubscribes to avoid waking up unnecessarily.

### GPU Busy Throttling

When the GPU is busy (signaled via `SetIsGpuBusy(true)`), the source
enters a throttling state machine:

1. `kIdle` — normal
2. `kOneBeginFrameAfterBusySent` — one frame dispatched since busy
3. `kThrottled` — subsequent frames are dropped until GPU is not busy

Source: `components/viz/common/frame_sinks/begin_frame_source.h`
(lines 135-266, 247-258)

---

## Frame Lifecycle

A single frame proceeds through these stages:

### 1. BeginFrame Arrives

`OnBeginFrameDerivedImpl()` receives the `BeginFrameArgs`. If the scheduler
doesn't need a frame (`!BeginFrameNeeded()`), the frame is dropped with
`FrameSkippedReason::kNoDamage`. If the scheduler is busy with a previous
frame, the new args are queued as `pending_begin_frame_args_` (any
previously pending frame is dropped with `kRecoverLatency`).

### 2. BeginImplFrame

The state machine enters `INSIDE_BEGIN_FRAME`. The client's
`WillBeginImplFrame()` runs animations, applies scroll deltas, and checks
for damage. If there is no damage, the draw is aborted early
(`AbortDraw()`).

The deadline is adjusted:

```
adjusted_deadline = args.deadline
                  - DrawDurationEstimate()
                  - kDeadlineFudgeFactor (1ms)
```

The fudge factor accounts for message latency and kernel scheduling
variability.

### 3. SendBeginMainFrame

If the state machine decides main-thread work is needed
(`ShouldSendBeginMainFrame()`), the impl thread posts
`BeginMainFrame` to the main thread. At most one is sent per frame.

On high refresh rate displays (>120Hz), the main frame can be throttled
to ~60Hz via `ShouldThrottleSendBeginMainFrame()`, unless the current
scroll is blocked on main-thread paint.

### 4. Main Thread Work

The main thread runs layout and paint, producing a new
`DisplayItemList`. When done, it signals `NotifyReadyToCommit()`.

### 5. Commit

The impl thread performs the commit (copies main-thread state to the
pending tree). A new pending tree is created.

`PostCommit()` runs as a separate step to avoid delaying the next
BeginMainFrame — time-consuming post-commit work (like
`CommitComplete()`) happens here.

### 6. Activation

When the pending tree's required tiles are rasterized
(`pending_tree_is_ready_for_activation_ = true`), the pending tree is
activated (swapped to become the active tree). `needs_redraw_` is set.

### 7. Deadline

The state machine enters `INSIDE_DEADLINE`. The draw phase begins.

### 8. Draw

`ScheduledActionDrawIfPossible()` calls:

1. `PrepareToDraw()` — runs damage tracking, builds render passes
2. `DrawLayers()` — generates and submits the `CompositorFrame`
3. `DidDrawAllLayers()` — resets damage state

### 9. FinishImplFrame

State returns to IDLE. If no frame was submitted, `DidNotProduceFrame`
is sent with the appropriate reason.

Source: `cc/scheduler/scheduler.cc` (lines 381-1014),
`cc/trees/proxy_impl.cc` (lines 719-999)

---

## Deadline Modes

The scheduler chooses a deadline mode based on the current state:

| Mode              | When To Fire                    | When Used                                            |
| ----------------- | ------------------------------- | ---------------------------------------------------- |
| `NONE`            | Never                           | Synchronous compositor, or not in a frame            |
| `IMMEDIATE`       | ASAP                            | Active tree ready, or no pending main work           |
| `WAIT_FOR_SCROLL` | `frame_time + interval * 0.333` | During scrolling, waiting for scroll input           |
| `REGULAR`         | `args.deadline`                 | Impl has animations but also waiting for main commit |
| `LATE`            | `frame_time + interval`         | Nothing to draw on impl, just waiting for main       |
| `BLOCKED`         | Indefinitely                    | Full-pipe mode, headless, waiting for all stages     |

The mode is selected by `CurrentBeginImplFrameDeadlineMode()`. The key
insight: `IMMEDIATE` is used when the impl thread already has everything
it needs to draw, while `REGULAR` gives the main thread until the vsync
deadline to contribute.

Source: `cc/scheduler/scheduler_state_machine.h` (lines 68-86),
`cc/scheduler/scheduler_state_machine.cc` (lines 1379-1408)

---

## Frame Skipping

Frames are skipped (not produced) for four reasons:

| Reason            | Trigger                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `kRecoverLatency` | MISSED frame past its deadline, or queued frame replaced           |
| `kNoDamage`       | `!BeginFrameNeeded()`, or no submit and no pending work            |
| `kWaitingOnMain`  | Frame ended without draw because commit/activation pending         |
| `kDrawThrottled`  | `needs_redraw_` but draw throttled by pending `CompositorFrameAck` |

Draw throttling is controlled by `pending_submit_frames_`: the compositor
allows at most 1 pending submit (`kMaxPendingSubmitFrames = 1`) before
throttling.

Source: `cc/scheduler/scheduler.h` (lines 48-53),
`cc/scheduler/scheduler_state_machine.cc` (lines 1561-1567)

---

## The State Machine

`SchedulerStateMachine` is the pure decision-maker. It has no I/O — it
only reads state and returns actions. This separation makes it testable
in isolation.

### Key State Variables

| Variable                                | Type | Purpose                                        |
| --------------------------------------- | ---- | ---------------------------------------------- |
| `begin_impl_frame_state_`               | enum | IDLE, INSIDE_BEGIN_FRAME, INSIDE_DEADLINE      |
| `begin_main_frame_state_`               | enum | IDLE, SENT, READY_TO_COMMIT                    |
| `has_pending_tree_`                     | bool | Whether a pending tree exists                  |
| `pending_tree_is_ready_for_activation_` | bool | Whether pending tree can activate              |
| `active_tree_needs_first_draw_`         | bool | Whether the active tree hasn't been drawn      |
| `needs_redraw_`                         | bool | Whether a draw is needed                       |
| `needs_begin_main_frame_`               | bool | Whether main thread work is needed             |
| `needs_prepare_tiles_`                  | bool | Whether tile management is needed              |
| `forced_redraw_state_`                  | enum | Forced redraw state machine (for checkerboard) |
| `consecutive_checkerboard_animations_`  | int  | Count of frames with checkerboarding           |

### Action Priority

`NextAction()` returns the highest-priority action that should be taken:

1. `SEND_BEGIN_MAIN_FRAME`
2. `POST_COMMIT`
3. `ACTIVATE_SYNC_TREE`
4. `COMMIT`
5. `DRAW_IF_POSSIBLE` / `DRAW_FORCED` / `DRAW_ABORT`
6. `PERFORM_IMPL_SIDE_INVALIDATION`
7. `PREPARE_TILES`
8. `INVALIDATE_LAYER_TREE_FRAME_SINK`
9. `BEGIN_LAYER_TREE_FRAME_SINK_CREATION`
10. `NOTIFY_BEGIN_MAIN_FRAME_NOT_EXPECTED_UNTIL`
11. `NOTIFY_BEGIN_MAIN_FRAME_NOT_EXPECTED_SOON`
12. `NONE`

`ProcessScheduledActions()` calls `NextAction()` in a loop until `NONE`
is returned. After the loop, it schedules the deadline and starts/stops
BeginFrame observation.

Source: `cc/scheduler/scheduler_state_machine.cc` (lines 762-793)

---

## Draw Conditions

`ShouldDraw()` checks (in order):

1. If draws should be aborted, only draw if active tree needs first draw
2. Do not draw more than once per deadline
3. Skip draw if early damage check found no damage
4. Require an active `LayerTreeFrameSink`
5. Do not draw if throttled (`pending_submit_frames_ >= 1`)
6. Must be in `INSIDE_DEADLINE` state
7. In full-pipe mode, wait for `active_tree_is_ready_to_draw_`
8. In `commit_to_active_tree` mode, don't draw if commit is pending

If `forced_redraw_state_ == WAITING_FOR_DRAW`, the draw is forced
regardless of most conditions.

Source: `cc/scheduler/scheduler_state_machine.cc` (lines 365-414)

---

## Forced Redraw (Checkerboard Recovery)

When `consecutive_checkerboard_animations_` reaches
`maximum_number_of_failed_draws_before_draw_is_forced` (default 3):

1. State transitions to `WAITING_FOR_COMMIT`
2. A `needs_begin_main_frame_` is set
3. After commit: `WAITING_FOR_ACTIVATION`
4. After activation: `WAITING_FOR_DRAW`
5. Draw is forced (bypasses normal draw conditions)
6. After successful draw: state returns to IDLE

This ensures that prolonged checkerboarding during animation is eventually
resolved, even at the cost of a synchronous commit.

Source: `cc/scheduler/scheduler_state_machine.h` (lines 107-114),
`cc/scheduler/scheduler_state_machine.cc` (lines 1076-1123)

---

## Impl Latency Priority

`ImplLatencyTakesPriority()` returns true when:

- `SMOOTHNESS_TAKES_PRIORITY` is the tree priority (during active
  scroll/pinch)
- AND the main thread does not have a scroll handler that is fast enough
  to complete within the frame

When true, the deadline mode becomes `IMMEDIATE` and BeginMainFrame is
not sent — the impl thread draws whatever content is available without
waiting for the main thread. This is the mechanism that keeps scrolling
smooth even when the main thread is busy with JavaScript.

Source: `cc/scheduler/scheduler_state_machine.cc` (lines 1671-1684)

---

## High Latency Detection

At the end of each frame (`OnBeginImplFrameIdle()`), the scheduler
checks if the main thread missed the deadline:

```
main_thread_missed_last_deadline_ =
    CommitPending() || has_pending_tree_ || active_tree_needs_first_draw_
```

If the main thread missed the last deadline, the scheduler adjusts:

- Checks whether the critical path (BMF queue to activation) is fast
  enough to fit within the frame interval minus draw duration
- If fast: sends BMF immediately (main thread can recover)
- If slow: defers BMF (avoids pipelining that increases latency)

Source: `cc/scheduler/scheduler_state_machine.cc` (lines 1359-1377),
`cc/scheduler/scheduler.cc` (lines 542-550)

---

## Tree Priority and Smoothness

`ProxyImpl::RenewTreePriority()` sets the tree priority based on
interaction state:

| Interaction                | Tree Priority                  |
| -------------------------- | ------------------------------ |
| Active scrolling           | `SMOOTHNESS_TAKES_PRIORITY`    |
| Pinch gesture / page scale | `SMOOTHNESS_TAKES_PRIORITY`    |
| Evicted UI resources       | `NEW_CONTENT_TAKES_PRIORITY`   |
| Default (idle)             | `SAME_PRIORITY_FOR_BOTH_TREES` |

The smoothness priority has a 250ms expiration timer. When it expires and
no gesture is active, priority returns to `SAME_PRIORITY_FOR_BOTH_TREES`.

Source: `cc/trees/proxy_impl.cc` (lines 520-588)

---

## DrawResult Enum

| Result                           | Meaning                                | Scheduler Response             |
| -------------------------------- | -------------------------------------- | ------------------------------ |
| `kSuccess`                       | Frame drawn and submitted              | Reset checkerboard counter     |
| `kAbortedCheckerboardAnimations` | Visible tiles missing during animation | Increment checkerboard counter |
| `kAbortedMissingHighResContent`  | High-res tiles missing                 | Request BeginMainFrame         |
| `kAbortedCantDraw`               | `can_draw_` is false                   | Retry up to 3 times            |
| `kAbortedDrainingPipeline`       | Pipeline draining                      | Reset counters                 |

Source: `cc/scheduler/draw_result.h`

---

## Key Settings

| Setting                                                | Default | Purpose                                       |
| ------------------------------------------------------ | ------- | --------------------------------------------- |
| `main_frame_before_activation_enabled`                 | false   | Send BMF while pending tree exists            |
| `main_frame_before_commit_enabled`                     | false   | Send BMF while previous commit pending        |
| `commit_to_active_tree`                                | false   | Skip pending tree (UI compositor only)        |
| `wait_for_all_pipeline_stages_before_draw`             | false   | Full-pipe mode (headless)                     |
| `maximum_number_of_failed_draws_before_draw_is_forced` | 3       | Checkerboard tolerance                        |
| `disable_frame_rate_limit`                             | false   | Disable draw throttling                       |
| `scroll_deadline_mode_enabled`                         | false   | Enable WAIT_FOR_SCROLL deadline mode          |
| `scroll_deadline_ratio`                                | 0.333   | Fraction of interval to wait for scroll input |

Source: `cc/scheduler/scheduler_settings.h`

---

## Source Files Referenced

- `cc/scheduler/scheduler.h`
- `cc/scheduler/scheduler.cc`
- `cc/scheduler/scheduler_state_machine.h`
- `cc/scheduler/scheduler_state_machine.cc`
- `cc/scheduler/scheduler_settings.h`
- `cc/scheduler/draw_result.h`
- `cc/trees/proxy_impl.cc`
- `cc/trees/single_thread_proxy.cc`
- `components/viz/common/frame_sinks/begin_frame_source.h`
