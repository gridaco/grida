// GRIDA-EE: entitlement — hosted AI recovery classification.

import type { AiErrorResponse } from "@/lib/ai/error";

export namespace AiRunGate {
  export type Remedy =
    | { kind: "signed_out"; href: "/sign-in" }
    | { kind: "organization_required"; href: "/organizations/new" }
    | {
        kind: "credit_required";
        organizationName: string;
        href: `/organizations/${string}/settings/billing`;
      }
    | { kind: "ready" }
    | { kind: "unavailable" };

  export type Failure<T> = {
    invocation: T;
    kind:
      | "auth_required"
      | "organization_required"
      | "credit_required"
      | "invalid_request"
      | "retryable"
      | "ambiguous";
    message: string;
    retryable: boolean;
    action?: { label: string; href: string };
  };

  /**
   * Translate a typed server refusal plus a server-resolved remedy into UI
   * state. The invocation is retained by identity so Retry cannot silently
   * pick up later changes to model or output controls.
   */
  export function refused<T>(
    error: AiErrorResponse,
    invocation: T,
    remedy: Remedy
  ): Failure<T> {
    if (error.code === "bad_request") {
      return {
        invocation,
        kind: "invalid_request",
        message:
          "This request is not supported. Review the prompt or settings and try again.",
        retryable: false,
      };
    }

    if (error.code === "internal") return ambiguous(invocation);

    switch (remedy.kind) {
      case "signed_out":
        return {
          invocation,
          kind: "auth_required",
          message: "Sign in in the new tab, then return here and retry.",
          retryable: true,
          action: { label: "Sign in", href: remedy.href },
        };
      case "organization_required":
        return {
          invocation,
          kind: "organization_required",
          message:
            "Create an organization in the new tab, then return here and retry.",
          retryable: true,
          action: { label: "Create organization", href: remedy.href },
        };
      case "credit_required":
        return {
          invocation,
          kind: "credit_required",
          message: `${remedy.organizationName} needs AI credit before this model can run. Add credit or ask an organization owner, then retry.`,
          retryable: true,
          action: { label: "Open billing", href: remedy.href },
        };
      case "ready":
        return {
          invocation,
          kind: "retryable",
          message: "AI access is ready. Retry the generation.",
          retryable: true,
        };
      case "unavailable":
        return retryable(invocation);
    }
  }

  export function transport<T>(invocation: T): Failure<T> {
    return ambiguous(invocation);
  }

  function retryable<T>(invocation: T): Failure<T> {
    return {
      invocation,
      kind: "retryable",
      message: "The AI request failed. Please try again.",
      retryable: true,
    };
  }

  function ambiguous<T>(invocation: T): Failure<T> {
    return {
      invocation,
      kind: "ambiguous",
      message:
        "Grida could not confirm whether this request completed. Check your Library before starting another generation; another attempt may be charged.",
      retryable: false,
    };
  }
}
