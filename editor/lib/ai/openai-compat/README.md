# Grida Gateway chat contract

<!-- GRIDA-GG: gateway -->
<!-- GRIDA-SEC-006 — see /SECURITY.md -->

`POST /api/v1/ai/chat/completions` accepts only a verified `gg:ai` bearer.
The bearer supplies organization authority; the existing AI seam owns the credit
gate and usage ingestion. The wire types and request schema live in `wire.ts`.

## Continuation v1

The ordinary Chat Completions fields preserve text, function calls and usage.
`reasoning_content` is display text: it cannot retain signed/encrypted reasoning
or the order of adjacent content blocks. Continuation v1 is an optional GG
extension for clients that retain complete assistant responses through a tool
loop. It supports OpenAI and Anthropic state carried by the Gateway V3 protocol.

Opt in on **every** request in that loop:

```json
{
  "model": "openai/gpt-6-sol",
  "grida_continuation": { "version": 1 },
  "messages": [{ "role": "user", "content": "What is the weather?" }],
  "tools": [
    {
      "type": "function",
      "function": { "name": "weather", "parameters": { "type": "object" } }
    }
  ]
}
```

For opted-in requests, `choices[0].message.grida_continuation` contains:

```ts
{
  version: 1;
  model: string;
  provider: "openai" | "anthropic";
  prefix_sha256: string;
  blocks: Array<
    | { type: "text"; text: string; item_id?: string }
    | {
        type: "tool_call";
        id: string;
        name: string;
        arguments: string;
        item_id?: string;
      }
    | {
        type: "reasoning";
        text: string;
        state:
          | { type: "anthropic-thinking"; signature: string }
          | { type: "anthropic-redacted"; data: string }
          | {
              type: "openai-reasoning";
              item_id: string;
              encrypted_content: string | null;
            };
      }
  >;
}
```

The client treats this envelope as opaque and echoes it unchanged on its
assistant message, alongside the original `content`, `reasoning_content` and
`tool_calls`, followed by the ordinary tool result messages. Preserve exact tool
argument strings. Adjacent text blocks, empty reasoning blocks, reasoning
summaries, and tool calls retain their original order. In streaming responses,
one complete envelope is emitted in `choices[0].delta.grida_continuation` on the
finish-reason chunk, before the optional usage chunk and `[DONE]`. It is never a
partial update. Clients must finish consuming the stream before continuing.

The envelope has at most 1024 blocks and at most 1,048,576 bytes of UTF-8 JSON.
Identifiers are nonempty and limited to 512 characters. Unknown envelope/block/
state fields, unsupported versions, duplicate function-call IDs, provider/model
mismatches, missing encrypted data, changed assistant projections and changed
prefixes are rejected with the existing 400 error envelope before provider work.
OpenAI item IDs on text/tool blocks require an OpenAI envelope. Each OpenAI
reasoning item ID needs a nonempty encrypted payload in at least one of its
summary blocks; earlier summaries may contain null because the payload arrives
at the final summary. An ID alone never authorizes a stored-response lookup.

The prefix digest covers the decoded preceding prompt and tool definitions,
with stable object-key ordering. This conservatively requires an unchanged
prefix throughout a tool loop, including earlier retained continuation blocks.
It is a consistency check, **not a signature or authentication check**. A client
can recompute a digest; the upstream provider remains responsible for validating
its own opaque state. GG does not interpret, synthesize or verify vendor
signatures. On a new user turn, a client may omit all earlier continuation state
and reasoning. It must not retain later envelopes whose recorded prefixes it
changed by doing so. This conservative GG rule is stricter than the provider's
rules for selectively dropping older thinking.

Opted-in OpenAI execution sets `store: false` and requests encrypted reasoning
through server-owned options. Only the listed metadata fields are reconstructed
on prompt parts. The decoded top-level call options still exclude
`providerOptions`; request-supplied options, organization IDs, destinations,
credentials and billing metadata cannot override execution or attribution.
Malformed or unsupported upstream continuation produces a safe 500, or a safe
SSE error without `[DONE]` after streaming starts. The stream collector also
limits retained input to 1 MiB, conservatively counting event framing and
metadata replacements, so a heavily fragmented stream may reach that bound
before its final envelope does. Upstream generation already performed remains
subject to the existing usage-ingestion behavior.

The exact models `openai/gpt-6-sol`, `openai/gpt-6-luna` and
`anthropic/claude-opus-5.5` require this capability when admitted by the hosted
catalogue. The check grants no catalogue membership. Opus 5.5 accepts only
automatic or no tool selection; required/named tool selection is rejected.
Continuation v1 does not expose effort controls: an explicit `reasoning_effort`
on an opted-in request is rejected; omission retains upstream defaults.
Existing model requests without the capability retain their earlier wire ABI.
Released clients that cannot echo this extension must receive a compatible
catalogue rather than being assigned these new models.

## Verification and limits

Producer tests exercise streaming/nonstreaming ordered state, tool results,
unknown/oversized input, prefix mismatch, stateless policy and the real billing
middleware. They use synthetic state and do not certify provider signatures or
perform paid inference. The pinned `ai@6.0.197` uses `@ai-sdk/gateway@3.0.125`,
whose `/language-model` V3 transport preserves prompt-part options and response
metadata; provider selection and the upstream API conversion run remotely.
`@ai-sdk/openai-compatible@2.0.48` alone does not implement this extension.

The provider requirements are documented in OpenAI's
[GPT-6 model guidance](https://developers.openai.com/api/docs/guides/latest-model),
Anthropic's [Opus 5.5 migration guide](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide)
and [preserved-thinking rules](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking).
Vercel documents [GPT-6 availability across its APIs](https://vercel.com/changelog/gpt-6-sol-and-luna-now-available-on-ai-gateway).
The local contract proof is separate from a live-provider compatibility check.

## Anti-goals

- No generic provider-options, metadata, header or destination forwarding.
- No stored conversation IDs, server conversation storage, or signing service.
- No Responses proxy, provider-executed tools, files, sources or tool approvals
  inside a continuation envelope.
- No model substitution, implicit reasoning downgrade, billing-policy change or
  client release admission inferred from provider catalogue metadata.
