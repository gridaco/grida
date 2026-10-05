"use server";
// Only this browser's Grida web session changes; the console candidate is confirmed separately.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BillingConsumerError } from "@/lib/platform/billing-consumer";
import {
  accountChangeOrigin,
  accountContinuation,
  accountSignInPath,
  resolveAccountContinuation,
} from "@/lib/platform/console-account";

export type AccountChangeState = { error: string | null };
export async function changeAccount(
  continuation: string,
  _previous: AccountChangeState,
  _formData: FormData
): Promise<AccountChangeState> {
  let signInURL: string;
  try {
    const origin = accountChangeOrigin(await headers());
    const token = accountContinuation({ continuation });
    // Page rendering is never mutation authority: check the live continuation again.
    await resolveAccountContinuation(token);
    signInURL = origin + accountSignInPath(token);
    const client = await createClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw new BillingConsumerError();
  } catch {
    return { error: "Unable to change accounts. Please try again." };
  }
  // Next redirect throws its control-flow exception and must remain outside the catch.
  redirect(signInURL);
}
