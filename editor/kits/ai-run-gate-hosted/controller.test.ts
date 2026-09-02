// GRIDA-EE: entitlement — hosted AI recovery classification tests.

import { describe, expect, it } from "vitest";
import type { AiErrorResponse } from "@/lib/ai/error";
import { AiRunGate } from "./controller";

const error = (code: AiErrorResponse["code"]): AiErrorResponse => ({
  success: false,
  code,
  message: "internal diagnostic that must not reach the UI",
  status: code === "blocked" ? 402 : 500,
});

describe("AiRunGate", () => {
  it("keeps the exact refused invocation for retry", () => {
    const invocation = { model: "openai/gpt-image-2", width: 1024 };
    const failure = AiRunGate.refused(error("blocked"), invocation, {
      kind: "credit_required",
      organizationName: "acme",
      href: "/organizations/acme/settings/billing",
    });

    expect(failure.invocation).toBe(invocation);
    expect(failure).toMatchObject({
      kind: "credit_required",
      retryable: true,
      action: {
        label: "Open billing",
        href: "/organizations/acme/settings/billing",
      },
    });
    expect(failure.message).not.toContain("internal diagnostic");
  });

  it("keeps organization creation in a second-tab remedy flow", () => {
    expect(
      AiRunGate.refused(
        error("no_organization"),
        { prompt: "cat" },
        {
          kind: "organization_required",
          href: "/organizations/new",
        }
      )
    ).toMatchObject({
      kind: "organization_required",
      retryable: true,
      action: { label: "Create organization", href: "/organizations/new" },
    });
  });

  it("does not offer an identical retry for a bad request", () => {
    expect(
      AiRunGate.refused(
        error("bad_request"),
        { prompt: "cat" },
        {
          kind: "ready",
        }
      )
    ).toMatchObject({ kind: "invalid_request", retryable: false });
  });

  it("does not retry ambiguous internal and transport failures", () => {
    expect(
      AiRunGate.refused(
        error("internal"),
        { prompt: "cat" },
        {
          kind: "unavailable",
        }
      ).retryable
    ).toBe(false);
    expect(AiRunGate.transport({ prompt: "cat" })).toMatchObject({
      kind: "ambiguous",
      retryable: false,
    });
  });
});
