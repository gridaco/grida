import { useCallback, useEffect, useState } from "react";
import ai from "@/lib/ai";

/**
 * Hook to query the authenticated user's remaining AI budget.
 *
 * The API returns budget in **mills** (1 mill = $0.001 USD).
 * Use `remainingUSD` for display, `remaining` for raw mills.
 */
export function useCredits() {
  const [remaining, setRemaining] = useState(0);
  const [reset, setReset] = useState(0);

  const refresh = useCallback(async () => {
    const r = await fetch(`/private/ai/credits`, {
      method: "GET",
    }).then((res) => res.json());
    setRemaining(r.data.remaining);
    setReset(r.data.reset);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    /** Raw remaining budget in mills */
    remaining,
    /** Remaining budget formatted as USD string (e.g. "$0.78") */
    remainingUSD: ai.millsToUSD(remaining),
    /** Unix timestamp (ms) when the budget window resets */
    reset,
    refresh,
  };
}
