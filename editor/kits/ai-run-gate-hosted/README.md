# Hosted AI run gate

> `GRIDA-EE: entitlement` — this kit is the hosted recovery layer around the
> OSS AI action/error contract.

`ai-run-gate-hosted` is the reusable client recovery state for hosted AI
actions.
It composes the existing typed AI error envelope with a server-resolved remedy
without treating browser balance state as authorization.

The kit owns three rules:

- retain the exact refused invocation so an explicit Retry does not pick up
  later model or output-setting changes;
- derive sign-in, organization, and billing destinations from the verified
  server session, never from a browser-supplied organization id;
- offer exact Retry only for known pre-provider refusals. Internal and transport
  failures are ambiguous and may already have been billed, so the kit warns
  instead of repeating them.

`resolveSessionAiRunRemedy()` is a display/remedy snapshot, not permission to
call a provider. It is only for actions that use the same session-fallback
organization; org-scoped actions must inject a resolver bound to their already
verified org. A successful AI server action remains the only authorization
signal. Billing and organization setup open in another tab so the calling
surface can keep its pending invocation in memory.

The kit deliberately does not own provider actions or page routing. Consumers
inject a correctly scoped remedy resolver into `useAiRunGate` and execute their
model action themselves.
