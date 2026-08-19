# Web AI topology

Start here when adding a playable AI surface to the web app. The public “gate”
is a composition of existing modules; no single client component is the payment
authority.

## Sources of truth

| Concern                                                     | Source                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| Model ids, capabilities, bindings, pricing                  | `@grida/ai-models`                                                         |
| Server auth, verified organization, provider call, metering | [`server.ts`](./server.ts)                                                 |
| Entitlement decision (`allowed` and reason)                 | [`billing/metronome.ts`](../billing/metronome.ts) `getEntitlement()`       |
| Client balance snapshot and action-envelope ingestion       | [`credits/`](./credits/README.md)                                          |
| Error-to-remedy routing                                     | [`error.ts`](./error.ts)                                                   |
| In-place sign-in and pending-action continuation            | [`use-continue-with-auth.tsx`](../../host/auth/use-continue-with-auth.tsx) |

The billing design is documented at
[AI credits](https://grida.co/docs/wg/platform/billing/ai-credits).

## The web run gate

A playable page currently composes two client concerns:

1. The auth continuation opens sign-in and resumes the pending user action.
2. `AiCredits` consumes the server action result, updates the displayed balance,
   and routes universal auth/organization failures.

The server action remains authoritative. It must enter through `withAiAuth()`
and the metered AI seam; client state never grants access. In particular, do not
implement access as `balance === 0` or infer how the credit was funded. The
server-provided entitlement decision is deliberately agnostic to purchased,
complimentary, or future credit sources.

### Current client limitation

Do not use `useAiCredits().allowed` to refuse a call before it reaches the
server. It is a cached display snapshot: the current controller marks it true
after a successful action, and its refresh envelope does not carry the complete
entitlement reason. The existing safe flow is to run the server action and
route its typed result. A future `ai-run-gate` kit must first carry an
authoritative access snapshot rather than derive permission from cents.

`useContinueWithAuth()` is auth-only. `AiCredits` is balance and error-flow
state. Neither is, by itself, a payment gate. A reusable stateful composition
belongs at `editor/kits/ai-run-gate` once it owns the complete
auth → organization → entitlement → remedy → retry interaction. The billing
decision and provider call stay in the server seam.

## Public model pages

Dedicated model-page publication is an editorial decision, not a catalogue
flag. The active media-only inventory is
[`www/data/ai-model-pages.ts`](../../www/data/ai-model-pages.ts). It owns search
intent and lifecycle; it references `@grida/ai-models` rather than duplicating
model facts.

Keep the indexable page shell useful without authentication. Mount the run gate
only around the interactive demo. The current `(www)/(ai)` layout preloads
credits for the whole subtree, so moving that preload down to playable islands
is part of introducing dedicated model routes, not a reason to mix session state
into their SEO content.

Web pages use cookie-backed server actions. They must not reuse Desktop’s GG
scoped-token session or native client routes.
