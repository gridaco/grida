import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";
import type { Platform } from "@/lib/platform";

type Params = { organization_id: number; project_id: number };

export async function GET(
  req: NextRequest,
  context: { params: Promise<Params> }
) {
  const { project_id } = await context.params;

  const client = await createClient();

  const { data: tags, error: projects_err } = await client
    .from("tag")
    .select(
      `
      *,
      customer_tag(count)
    `
    )
    .eq("project_id", project_id);

  if (!tags) {
    return notFound();
  }

  const tagsWithUsage = tags?.map((tag) => ({
    ...tag,
    usage_count: tag.customer_tag[0]?.count || 0,
  })) satisfies Platform.Tag.TagWithUsageCount[];

  return NextResponse.json({
    data: tagsWithUsage,
    error: null,
  });
}
