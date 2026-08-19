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
| Error classification and redirect hints                     | [`error.ts`](./error.ts)                                                   |
| In-place sign-in and pending-action continuation            | [`use-continue-with-auth.tsx`](../../host/auth/use-continue-with-auth.tsx) |
| Retained invocation and server-resolved recovery UI         | [`kits/ai-run-gate-hosted`](../../kits/ai-run-gate-hosted/README.md)       |

The billing design is documented at
[AI credits](https://grida.co/docs/wg/platform/billing/ai-credits).

## The web run gate

A playable page composes three client concerns:

1. The auth continuation opens sign-in and resumes the pending user action.
2. `AiCredits` consumes a successful server action result and updates the
   displayed balance.
3. `ai-run-gate-hosted` retains a refused invocation and obtains the verified
   organization or billing recovery destination from the server.

The image playground has adopted all three. Older surfaces that call
`AiCredits.consume()` on a failure still use its redirect behavior and do not
retain their invocation; migrate them before describing their recovery flow as
seamless.

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
route its typed result. `ai-run-gate-hosted` carries a server-sourced
remedy/display snapshot rather than deriving permission from cents. The
attempted server action remains the authorization point.

`useContinueWithAuth()` is auth-only. `AiCredits` is balance state.
`editor/kits/ai-run-gate-hosted` owns recovery state and explicit retry. None
is, by itself, a payment authority: the billing decision and provider call stay
in the server seam.

## Public model pages

Dedicated model-page publication is an editorial decision, not a catalogue
flag. The active media-only inventory is
[`www/data/ai-model-pages.ts`](../../www/data/ai-model-pages.ts). It owns search
intent and lifecycle; it references `@grida/ai-models` rather than duplicating
model facts.

Keep the indexable page shell useful without authentication. Mount the run gate
only around the interactive demo. A future embedded demo must fetch its
server-sourced display/remedy state from the client after hydration; moving a
cookie-reading Server Component lower in the same route would still make the
page request-dynamic. Routed demos keep the model page fully static and let the
destination playground own its existing request-time preload.

Web pages use cookie-backed server actions. They must not reuse Desktop’s GG
scoped-token session or native client routes.
