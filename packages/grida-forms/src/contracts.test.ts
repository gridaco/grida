import { expectTypeOf, it } from "vitest";
import type { FormClientFetchResponse, FormSubmitResponse } from "./contracts";

it("describes success, omitted-data domain failures and structured HTTP failures", () => {
  const success = {
    data: { id: "response-id", customer_id: null },
    error: null,
  } satisfies FormSubmitResponse;
  const domainFailure = {
    error: "Form not found",
  } satisfies FormSubmitResponse;
  const frameworkFailure = {
    error: { code: "BAD_REQUEST", message: "Invalid JSON" },
    request_id: "request-id",
  } satisfies FormSubmitResponse;
  const explicitNullFailure = {
    data: null,
    error: "Bad Request",
  } satisfies FormSubmitResponse;
  const loadFailure = {
    error: "session not found",
  } satisfies FormClientFetchResponse;

  expectTypeOf(success).toMatchTypeOf<FormSubmitResponse>();
  expectTypeOf(domainFailure).toMatchTypeOf<FormSubmitResponse>();
  expectTypeOf(frameworkFailure).toMatchTypeOf<FormSubmitResponse>();
  expectTypeOf(explicitNullFailure).toMatchTypeOf<FormSubmitResponse>();
  expectTypeOf(loadFailure).toMatchTypeOf<FormClientFetchResponse>();
});
