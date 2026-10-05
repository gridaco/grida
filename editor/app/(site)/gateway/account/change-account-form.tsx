"use client";
import React, { useState } from "react";
import { Button } from "@app/ui/components/button";
import { Alert, AlertDescription } from "@app/ui/components/alert";

export function ChangeAccountForm({ continuation }: { continuation: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(false);
        try {
          const response = await fetch("/gateway/account/change", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            redirect: "error",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ continuation }),
          });
          if (!response.ok || (await response.json()).ready !== true)
            throw new Error("Account change unavailable");
          const next = `/gateway/account?${new URLSearchParams({ continuation })}`;
          window.location.assign(`/sign-in?${new URLSearchParams({ next })}`);
        } catch {
          setError(true);
          setBusy(false);
        }
      }}
      className="space-y-3"
    >
      <p className="text-sm text-muted-foreground">
        To choose another account, sign out of Grida in this browser. Your
        console session stays active until you confirm a change.
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Unable to change accounts. Please try again.
          </AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        variant="outline"
        className="w-full"
        disabled={busy}
      >
        {busy ? "Opening sign-in…" : "Use another account"}
      </Button>
    </form>
  );
}
