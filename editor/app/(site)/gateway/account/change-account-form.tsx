"use client";
import React, { useActionState } from "react";
import { Button } from "@app/ui/components/button";
import { Alert, AlertDescription } from "@app/ui/components/alert";
import type { AccountChangeState } from "./actions";

export function ChangeAccountForm({
  action,
  permalink,
}: {
  action: (
    state: AccountChangeState,
    formData: FormData
  ) => Promise<AccountChangeState>;
  permalink: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    { error: null },
    permalink
  );
  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        To choose another account, sign out of Grida in this browser. Your
        console session stays active until you confirm a change.
      </p>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        variant="outline"
        className="w-full"
        disabled={pending}
      >
        {pending ? "Opening sign-in…" : "Use another account"}
      </Button>
    </form>
  );
}
