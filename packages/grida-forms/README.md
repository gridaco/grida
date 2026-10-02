# @grida/forms

Internal shared Forms contracts, render models, value conversion and pure utilities. Both the public API and the editor depend on this package.

This package must not import application source, React, Next.js, database clients, provider clients or environment configuration. Database writes, authorization and HTTP handlers belong to their application owners. Domain configuration types are not automatically public HTTP fields; public responses use the explicit contracts and projections.

Build, typecheck and test with the corresponding package scripts.
