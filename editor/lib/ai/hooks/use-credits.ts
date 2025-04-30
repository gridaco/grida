import { useCallback, useEffect, useState } from "react";

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
    remaining,
    reset,
    refresh,
  };
}
