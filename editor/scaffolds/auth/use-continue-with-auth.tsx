"use client";

import useSession from "@/lib/supabase/use-session";
import { createContext, useContext, useState } from "react";
import { ContinueWithAuthDialog } from "./continue-with-auth-dialog";
import { createPortal } from "react-dom";

interface AuthContextType {
  withAuth: <T extends (...args: any[]) => any>(original: T) => T;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingCallback, setPendingCallback] = useState<Function | null>(null);

  const withAuth = <T extends (...args: any[]) => any>(callback: T) => {
    return (async (...args: any[]) => {
      if (session) {
        return await callback(...args);
      } else {
        setPendingCallback(() => () => callback(...args));
        setIsOpen(true);
        return false;
      }
    }) as unknown as T;
  };

  const handleAuthSuccess = async () => {
    setIsOpen(false);
    if (pendingCallback) {
      await pendingCallback();
      setPendingCallback(null);
    }
  };

  return (
    <AuthContext.Provider value={{ withAuth }}>
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
