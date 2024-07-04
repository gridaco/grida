import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { secureformsclient } from "@/lib/supabase/vault";
import { cookies } from "next/headers";
import {
  secureCreateServiceKey,
  secureFetchServiceKey,
} from "@/services/x-supabase";

interface Context {
  params: {
    form_id: string;
  };
}

export async function GET(req: NextRequest, context: Context) {
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  // TODO: This is secure (protected by RLS), but we need to add extra verification of the ownership of the form.
  const { data: conn } = await supabase
    .from("connection_supabase")
    .select()
    .eq("form_id", form_id)
    .single();

  if (!conn) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  // handle secret value with service client, using secure RPC.
  const { data } = await secureFetchServiceKey(conn.supabase_project_id);

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, context: Context) {
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  // TODO: This is secure (protected by RLS), but we need to add extra verification of the ownership of the form.
  const { data: conn } = await supabase
    .from("connection_supabase")
    .select()
    .eq("form_id", form_id)
    .single();

  if (!conn) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  const { secret } = await req.json();

  // handle secret value with service client, using secure RPC.
  const { data, error } = await secureCreateServiceKey(
    conn.supabase_project_id,
    secret
  );

  if (error) {
    console.error(error);
    return NextResponse.error();
  }

  return NextResponse.json({ data });
}
