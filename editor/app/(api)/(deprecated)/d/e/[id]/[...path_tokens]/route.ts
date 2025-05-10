import { Env } from "@/env";
import { service_role } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import query_d_e from "../_query";

/**
 * legacy /d/e/[id] redirection to tenant.grida.site
 */
export async function GET(
  request: NextRequest,
  segmentData: {
    params: Promise<{
      id: string;
      path_tokens: string[];
    }>;
  }
) {
  const { id, path_tokens } = await segmentData.params;

  try {
    const { baseUrl } = await query_d_e(id);
    const path = `/d/e/${id}/${path_tokens.join("/")}`;

    return NextResponse.redirect(new URL(path, baseUrl), {
      status: 301,
    });
  } catch (error) {
    return notFound();
  }
}
