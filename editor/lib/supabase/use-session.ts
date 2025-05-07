"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { type Session } from "@supabase/supabase-js";

export default function useSession() {
  const client = useMemo(() => createBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    client.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, [client.auth]);

  return session;
}
