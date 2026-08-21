"use client";

// GRIDA-EE: entitlement — hosted AI recovery state.

import { useState } from "react";
import type { AiErrorResponse } from "@/lib/ai/error";
import { AiRunGate } from "./controller";

export function useAiRunGate<T>(
  resolveRemedy: () => Promise<AiRunGate.Remedy>
) {
  const [failure, setFailure] = useState<AiRunGate.Failure<T> | null>(null);

  return {
    failure,
    clear: () => setFailure(null),
    refuse: async (error: AiErrorResponse, invocation: T) => {
      const remedy = await resolveRemedy().catch(
        () => ({ kind: "unavailable" }) as const
      );
      setFailure(AiRunGate.refused(error, invocation, remedy));
      return false as const;
    },
    fail: (invocation: T) => {
      setFailure(AiRunGate.transport(invocation));
      return false as const;
    },
  };
}
