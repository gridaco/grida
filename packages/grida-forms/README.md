# @grida/forms

Internal shared Forms contracts, render models and domain rules. Both the public API and the editor depend on this package.

The root entry exports field models and public response projections, value conversion, scheduling, response-file conventions (`FormsStorage`), request metadata names (`FormsRequestHeaders`), provisional-contact extraction (`FormResponseContacts.provisional`) and response index formatting (`formatResponseIndex`). `FormInputTypes` and `FormFieldAutocompleteTypes` are the complete model vocabulary. A consumer's narrower authoring or generation policy must remain an explicit subset.

`@grida/forms/templating` separately exports `TemplateVariables` and the Handlebars `render` function. Normal HTML escaping, optional compile options and the per-invocation `uuid` helper are preserved. Its context schemas describe template-editor metadata; some contexts are incomplete and must not be used as request validators. `createContext` provides a type, not runtime validation. Importing the root entry does not load the template renderer.

Public error contracts permit omitted `data` and structured infrastructure errors. Inspect errors and HTTP status before treating a response as successful. Provisional contacts are string candidates from persisted response fields, deduplicated in encounter order; challenge emails require persisted `challenge-success`. This helper neither establishes identity nor validates addresses.

## Anti-goals

This package must not import application source, React, Next.js, database clients, provider clients or environment configuration. Database writes, authorization and HTTP handlers belong to their application owners. Domain configuration types are not automatically public HTTP fields; public responses use the explicit contracts and projections.

Brand copy, translations, email templates and UI rendering stay outside this package. Generic utilities are not promoted here merely because applications share them. Request metadata headers do not authenticate a caller, and storage constants do not grant file access.

Build, typecheck and test with the corresponding package scripts.
