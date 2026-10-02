import { afterEach, describe, expect, test, vi } from "vitest";
import { SubmissionDiagnostics } from "../server/forms/submission-diagnostics";

afterEach(() => vi.restoreAllMocks());

describe("SubmissionDiagnostics", () => {
  test("records only a fixed stage and UUID request correlation", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const requestId = "7cc75926-1c54-44bd-983a-28c6cfb39b82";
    SubmissionDiagnostics.warning("response_fields_write", requestId);
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        event: "forms_best_effort_failure",
        stage: "response_fields_write",
        request_id: requestId,
      })
    );
  });

  test.each([
    null,
    undefined,
    "",
    "respondent@example.test",
    "secret\ninjected",
    "7cc75926-1c54-44bd-983a-28c6cfb39b82/private",
  ])("omits arbitrary request correlation input: %s", (requestId) => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    SubmissionDiagnostics.warning("staged_file_move", requestId);
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        event: "forms_best_effort_failure",
        stage: "staged_file_move",
      })
    );
  });
});
