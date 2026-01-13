"use client";

import { useEffect, useMemo } from "react";
import { createBrowserCIAMClient } from "@/lib/supabase/client";

/**
 * Best-effort background touch loop for portal session tokens.
 * This does NOT gate rendering; it just keeps the portal session alive.
 */
export function usePortalSessionTouch(token: string) {
  const ciam = useMemo(() => createBrowserCIAMClient(), []);

  useEffect(() => {
    let cancelled = false;
    const intervalMs = 60_000;

    const tick = async () => {
      const { error } = await ciam.rpc("touch_customer_portal_session", {
        p_token: token,
        p_min_seconds_between_touches: 60,
      });
      if (!cancelled && error) {
        // intentionally silent (best-effort)
      }
    };

    tick();
    const handle = setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [ciam, token]);
}
