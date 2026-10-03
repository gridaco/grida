# @workspace/utils

Private, explicitly imported primitives shared by the hosted applications.
There is no root barrel: `@workspace/utils/http` is browser-safe request/header
normalization; `@workspace/utils/otp` is a Node-only cryptographic numeric OTP
helper. Import only the entrypoint the caller needs.

These modules own no product/domain rules, application state, environment,
credentials, transport clients or delivery. Product logic belongs in its domain
package. This is not a place for application services or a second Forms model.

Build, typecheck and test with the package scripts. Existing editor import paths
may re-export these entrypoints; they must not retain implementations.
