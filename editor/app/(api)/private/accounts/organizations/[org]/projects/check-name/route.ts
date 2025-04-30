import { createClient } from "@/lib/supabase/server";
import {
  isValidUsername,
  username_validation_messages,
} from "@/services/utils/regex";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Params = { org: string };

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { org } = await context.params;

  const client = await createClient();

  const { data: orgref, error: orgerr } = await client
    .from("organization")
    .select("id, name")
    .eq("name", org)
    .single();

  if (orgerr) {
    console.error(orgerr);
    return notFound();
  }

  if (!orgref) {
    return notFound();
  }

  const { value } = await req.json();

  const { data, error } = await client
    .from("project")
    .select("name")
    .eq("organization_id", orgref.id)
    .ilike("name", value)
    // do not add single() as it will throw error when no rows are found - use limit(1) instead - (this is actually not needed)
    .limit(1);

  if (error) {
    console.error(error);
    return NextResponse.error();
  }

  const available = data.length === 0;
  const valid = isValidUsername(value);

  return NextResponse.json({
    ok: available && valid,
    message: available
      ? valid
        ? username_validation_messages.available
        : username_validation_messages.invalid
      : username_validation_messages.taken,
  });
}
