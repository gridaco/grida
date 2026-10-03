# @grida/forms

Internal shared Forms contracts, render models and domain rules. Both the public API and the editor depend on this package.

The root entry exports field models and public response projections, value conversion, scheduling, response-file conventions (`FormsStorage`), request metadata names (`FormsRequestHeaders`), provisional-contact extraction (`FormResponseContacts.provisional`) and response index formatting (`formatResponseIndex`). `FormInputTypes` and `FormFieldAutocompleteTypes` are the complete model vocabulary. A consumer's narrower authoring or generation policy must remain an explicit subset.

`@grida/forms/templating` separately exports `TemplateVariables` and the Handlebars `render` function. Normal HTML escaping, optional compile options and the per-invocation `uuid` helper are preserved. Its context schemas describe template-editor metadata; some contexts are incomplete and must not be used as request validators. `createContext` provides a type, not runtime validation. Importing the root entry does not load the template renderer.

Public error contracts permit omitted `data` and structured infrastructure errors. Inspect errors and HTTP status before treating a response as successful. Provisional contacts are string candidates from persisted response fields, deduplicated in encounter order; challenge emails require persisted `challenge-success`. This helper neither establishes identity nor validates addresses.

`FormsApiPaths` owns the `/v1/forms` product namespace on the shared Grida API.
It returns origin-free paths for `form(formId)`, `session(formId)`,
`submit(formId)`, and the session/field operations `field`, `fieldSearchMeta`,
`fieldUploadSignedUrl`, `fieldPreviewPublicUrl`, `emailChallengeStart`,
`emailChallengeVerify` and `emailChallengeState`. Each session/field operation
takes `(sessionId, fieldId)`. Pass raw identifiers: every segment is URI-encoded
once, including an input percent sign. Empty identifiers and literal `.` or `..`
are rejected because URL normalization would change their path structure.
Identifier validity and resource access remain the caller's responsibility.

The caller supplies its API origin separately, for example
`new URL(FormsApiPaths.submit(formId), apiOrigin)`. `FormsApiPaths.prefix` is a
pathname, never an origin or configurable base URL. `isPath(pathname)` accepts
the exact namespace or a slash-bounded descendant; pass a parsed URL pathname.
It neither decodes aliases nor validates routes, methods or authorization.
Unqualified `/v1/...` Forms aliases are outside this contract. Website links
from `formlink` and `formerrorlink` remain a separate surface.

`FormValue.parseEntries(entries, options)` normalizes every submitted entry for
one field into `{ ok: true, raw, parsed, option_ids }`, or returns
`{ ok: false, error: "ambiguous-scalar" }` for conflicting scalar entries. Pass
the same `type`, `multiple`, `enums` and optional `utc_offset` accepted by
`FormValue.parse`; a field without a known type uses `type: undefined`. The
existing single-value parser and its conversion failures are unchanged.

`FormValue.submissionCardinality(options)` describes submission semantics;
`FieldSupports.multiple` retains its HTML capability meaning. Checkboxes are
always plural literal values, including commas and UUID-looking strings. Only
enabled multi-toggle groups unpack comma-separated option references, including
references spread across repeated entries. Select and email remain scalar even
with `multiple: true`. Identical scalar duplicates collapse without coercion;
an absent scalar is `null`, while an absent plural selection is `[]`.

File aliases preserve all entries as an array, including file objects and packed
path strings, without parsing, splitting or deduplicating their independent
transport. The caller still owns file validation and storage. `option_ids`
contains every matched identity once in encounter order, including all options
with a matching checkbox literal. Toggle references retain the existing parser's
resolution rules; raw input may contain unmatched references. This is value
normalization, not option authorization or inventory policy. Consumers must use
the complete identity list when enforcing those policies.

## Anti-goals

This package must not import application source, React, Next.js, database clients, provider clients or environment configuration. Database writes, authorization and HTTP handlers belong to their application owners. Domain configuration types are not automatically public HTTP fields; public responses use the explicit contracts and projections.

Brand copy, translations, email templates and UI rendering stay outside this package. Generic utilities are not promoted here merely because applications share them. Request metadata headers do not authenticate a caller, and storage constants do not grant file access.

Build, typecheck and test with the corresponding package scripts.
