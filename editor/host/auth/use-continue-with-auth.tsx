"use client";

import { createPortal } from "react-dom";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ContinueWithAuthDialog } from "./continue-with-auth-dialog";
import { type Session } from "@supabase/supabase-js";
import useSession from "@/lib/supabase/use-session";
import usePendingCallback from "@/hooks/use-pending-callback";

interface AuthContextType {
  session: Session | null;
  withAuth: <A extends unknown[], R>(
    original: (...args: A) => R
  ) => (...args: A) => R;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [, pendingHandlers] = usePendingCallback();
  const hasHandledSession = useRef(false);

  const withAuth = <A extends unknown[], R>(callback: (...args: A) => R) => {
    return (async (...args: A) => {
      if (session) {
        return await callback(...args);
      } else {
        return new Promise((resolve, reject) => {
          pendingHandlers.setCallback(async () => {
            try {
              const result = await callback(...args);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          });
          setIsOpen(true);
        });
      }
    }) as unknown as (...args: A) => R;
  };

  const handleAuthSuccess = async () => {
    if (hasHandledSession.current) {
      return;
    }

    setIsOpen(false);
    try {
      await pendingHandlers.executeCallback();
    } catch {}
    hasHandledSession.current = true;
  };

  useEffect(
    () => {
      if (session && !hasHandledSession.current) {
        handleAuthSuccess();
      }

      return () => {
        hasHandledSession.current = false;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session]
  );

  return (
    <AuthContext.Provider value={{ withAuth, session }}>
      {children}
      {typeof window !== "undefined" &&
        createPortal(
          <ContinueWithAuthDialog
            open={isOpen}
            onOpenChange={setIsOpen}
            onSuccess={handleAuthSuccess}
          />,
          document.body
        )}
    </AuthContext.Provider>
  );
}

export function useContinueWithAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useContinueWithAuth must be used within an AuthProvider");
  }
  return context;
}
