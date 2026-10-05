// Only the current Grida web session is signed out; console and other sessions remain separate.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BillingConsumerError } from "@/lib/platform/billing-consumer";
import {
  accountChangeInput,
  resolveAccountContinuation,
} from "@/lib/platform/console-account";
const headers = { "cache-control": "no-store" };
export async function POST(request: Request) {
  try {
    const continuation = await accountChangeInput(request);
    await resolveAccountContinuation(continuation);
    const client = await createClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw new BillingConsumerError();
    return NextResponse.json({ ready: true }, { headers });
  } catch (error) {
    const status =
      error instanceof BillingConsumerError && error.code !== "unavailable"
        ? 403
        : 503;
    return NextResponse.json(
      { error: "account_change_unavailable" },
      { status, headers }
    );
  }
}
