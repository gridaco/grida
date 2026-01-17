import { NextRequest, NextResponse } from "next/server";
import { createXSBClient } from "@/lib/supabase/server";
import {
  secureCreateServiceKey,
  __dangerously_fetch_secure_service_role_key,
} from "@/services/x-supabase";

type Params = { supabase_project_id: string };

interface Context {
  params: Promise<Params>;
}

export async function GET(req: NextRequest, context: Context) {
  const xsbClient = await createXSBClient();
  const { supabase_project_id: supabase_project_id_param } =
    await context.params;
  const supabase_project_id = Number(supabase_project_id_param);
  if (!Number.isFinite(supabase_project_id)) {
    return NextResponse.json(
      { error: "Invalid supabase_project_id" },
      { status: 400 }
    );
  }

  // [REQUIRED SECURITY LAYER]
  // Security layer - this is secure (protected by RLS).
  const { error: rls_err } = await xsbClient
    .from("supabase_project")
    .select("id")
    .eq("id", supabase_project_id)
    .single();

  if (rls_err) {
    console.error("RLS ERR:", rls_err);
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  // handle secret value with service client, using secure RPC.
  const { data } =
    await __dangerously_fetch_secure_service_role_key(supabase_project_id);

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, context: Context) {
  const xsbClient = await createXSBClient();
  const { supabase_project_id: supabase_project_id_param } =
    await context.params;
  const supabase_project_id = Number(supabase_project_id_param);
  if (!Number.isFinite(supabase_project_id)) {
    return NextResponse.json(
      { error: "Invalid supabase_project_id" },
      { status: 400 }
    );
  }

  // [REQUIRED SECURITY LAYER]
  // Security layer - this is secure (protected by RLS).
  const { error: rls_err } = await xsbClient
    .from("supabase_project")
    .select("id")
    .eq("id", supabase_project_id)
    .single();

  if (rls_err) {
    console.error("RLS ERR:", rls_err);
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  const { secret } = await req.json();

  // handle secret value with service client, using secure RPC.
  const { data, error } = await secureCreateServiceKey(
    supabase_project_id,
    secret
  );

  if (error) {
    console.error("error while creating vault record", error);
    return NextResponse.error();
  }

  return NextResponse.json({ data });
}
