# `lib/ai/credits` — AI Credits Module

The single source of truth for the AI credit balance UX. Every AI call
site that displays balance or routes the GRIDA-SEC-003 gate flow
consumes from this module.

## Purpose

Before this module: each AI page hand-rolled its own balance state,
format helpers, refresh logic, and gate-error routing. Three different
pages, three different shapes — including one (`useCredits`) that was a
deprecated stub returning `$0.00`.

This module collapses the surface to:

- One class (`AiCreditsController`) that owns state + commands
- One React hook (`useAiCredits`) that binds it
- One namespace (`AiCredits`) for Provider + format helpers
- Two server actions (`preloadAiCredits`, `refreshAiCredits`) at the seam

## Public API

### Client (import from `@/lib/ai/credits`)

```ts
import { AiCredits, useAiCredits, AiCreditsController } from "@/lib/ai/credits";

// 1. Wrap a route subtree with the provider, seeding from server preload.
<AiCredits.Provider initial={{ cents, allowed }}>{children}</AiCredits.Provider>

// 2. Consume from any client component.
const credits = useAiCredits();
credits.cents              // number | null      (null = unauth / no org)
credits.allowed            // boolean            (gate state)
credits.formatted          // "$26.0" | null     chip display
credits.formattedExact     // "$25.9921" | null  tooltip
credits.refresh()          // Promise<void>      pull live from server
credits.consume(env, opts) // AiActionData<T> | undefined

// 3. Static format helpers (rare; hook returns derived strings).
AiCredits.format.chip(2599);    // "$26.0"
AiCredits.format.exact(2599);   // "$25.9921"
AiCredits.format.usd(0.000075); // "$0.000075"
```

### Server (import from `@/lib/ai/credits/actions`)

```ts
import { preloadAiCredits, refreshAiCredits } from "@/lib/ai/credits/actions";

// Used by route-group `layout.tsx` / server `page.tsx` to seed Provider.
const initial = await preloadAiCredits(orgId);

// Internal — invoked by useAiCredits().refresh(). Pages rarely call directly.
const env = await refreshAiCredits();
```

## Roles & Responsibilities

| File            | Owns                                                                      | May NOT                                                                    |
| --------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `controller.ts` | State, commands (`consume`, `refresh`), subscribers                       | Import React / Next.js / sonner; depend on `window` outside `navigate` dep |
| `format.ts`     | Pure `cents → string` and `usd → string` helpers                          | Hold state or read env                                                     |
| `provider.tsx`  | React `<Provider>` + `useAiCredits` hook                                  | Contain business logic — every mutation goes through the controller        |
| `actions.ts`    | Server actions bridging to `withAiAuth`                                   | Hold state, import React                                                   |
| `index.ts`      | Public client barrel (`AiCredits`, `useAiCredits`, `AiCreditsController`) | Re-export server actions (boundary leak)                                   |

## Contract

1. **Envelope shape.** Every successful AI server action returns
   `AiActionResult<T> = { success: true; data: T & { balanceCents: number } }`.
   The server seam ([`withAiAuth`](../server.ts)) is responsible for
   appending `balanceCents` when `opts.balance !== false`.

2. **Consume contract.** `AiCreditsController.consume(env, opts)` is the
   canonical client-side ingestion of that envelope:
   - **Success** → fold `balanceCents` into state, return `env.data`.
   - **Failure (redirect)** → `unauthorized` / `no_organization` → call
     the injected `navigate(href)` (default: `window.location.href`),
     return `undefined`.
   - **Failure (toast)** → `blocked` / `bad_request` / `internal` →
     return `undefined`. **The page is responsible for the toast UX**,
     including bespoke styling like the "Top up" CTA on `blocked`.
     Re-resolve via `resolveAiError(env, opts)` from `@/lib/ai/error`.

3. **Null balance.** `cents === null` means "unauth or no org". UI
   renders `"—"`, never `"$0.00"`. The deprecated `$0.00` stub at
   `hooks/use-credits.ts` was deleted as part of this refactor.

4. **Initial state.** Must come from a server preload
   (`preloadAiCredits`) at a route or layout boundary that owns the
   `orgId`. The Provider does not fetch on mount.

## Lifecycle

```
Server: layout.tsx await preloadAiCredits(orgId) ─┐
                                                  ▼
Client: <AiCredits.Provider initial={...}>
           │
           │ on mount: ref.current = new AiCreditsController(initial, deps)
           │
           ├── useAiCredits() subscribes via useSyncExternalStore
           │
           ├── credits.consume(env)  → controller.consume()  → set() → notify
           │
           ├── credits.refresh()     → controller.refresh()  → set() → notify
           │
           └── on unmount: ref.current.dispose()
                                       │
                                       ├── disposed = true
                                       ├── listeners.clear()
                                       └── pending fetches gated (no-op on return)
```

## Testing Strategy

All coverage lives in `__tests__/controller.test.ts` — the class is
fully testable without React via DI:

```ts
const ctrl = new AiCreditsController(
  { cents: 1000, allowed: true },
  {
    fetcher: vi
      .fn()
      .mockResolvedValue({ success: true, data: { balanceCents: 990 } }),
    router: vi.fn(),
    navigate: vi.fn(),
  }
);
const data = ctrl.consume(envelope);
expect(ctrl.getSnapshot().cents).toBe(990);
```

The React binding (`provider.tsx`) is intentionally thin — `Provider`
constructs the controller, `useAiCredits` reads via
`useSyncExternalStore`. A dedicated React render test was deferred:
this repo's vitest setup is pure Node (no jsdom), and the binding
contains no branching beyond standard React patterns. Add a
`@vitest-environment jsdom` test once jsdom is in dev-deps.

## Design Rationale

- **Class-based core**: enterprise convention in this codebase.
  Predictable lifecycle, no hook closure pitfalls, testable without a
  React renderer.
- **`useSyncExternalStore`**: canonical React 19 binding for external
  stores; concurrent-mode safe.
- **Top-level `useAiCredits` (vs `AiCredits.use`)**: matches React
  idiom; `rules-of-hooks` lint and grep both key off the `useFoo`
  identifier.
- **`consume()` returns the unwrapped data**: collapses success +
  redirect-failure into one call-site line.
- **Toast failures left to caller**: bespoke styling (e.g. blocked
  - "Top up" CTA) depends on page-specific data (`billingHref`).
    Centralizing it would require either deep injection or a generic
    toast that loses the CTA.
- **DI on controller**: tests don't mock at the module boundary —
  production wiring lives in default args, tests pass mocks via
  `new AiCreditsController(initial, deps)`.
- **Package-shape today, package-extraction tomorrow**: layout mirrors
  `packages/grida-canvas-*`. Lift to `packages/grida-ai-credits/` is
  mechanical when the time comes.

## Future Extraction

When this leaves the editor, move `lib/ai/credits/` →
`packages/grida-ai-credits/src/`. Two import edits required:

- `actions.ts` — `@/lib/ai/server` → peer-package import
- `controller.ts` — `@/lib/ai/error` → peer-package or inlined router

Everything else is path-stable.

## Non-Goals

- **Streaming SSE envelopes** (the canvas agent route at
  `/private/ai/chat/route.ts`). Folding `balanceCents` into a trailing
  SSE event is a separate task.
- **Subscription / auto-reload UI** (the billing settings page). That
  surface has its own concern (Stripe subscription state) and uses
  `getAiCreditsSummary`.
- **Per-feature cost previews**. Callers compute via the cost cards in
  `lib/ai/models.ts`; this module formats the _result_, not the
  estimate.
