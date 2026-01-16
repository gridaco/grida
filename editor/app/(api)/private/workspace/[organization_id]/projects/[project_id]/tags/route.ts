import { createClient, createCIAMClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";
import type { Platform } from "@/lib/platform";

type Params = { organization_id: string; project_id: string };

/**
 * Get tags with usage counts for a project.
 *
 * NOTE: Tags are currently only used by customer_tag, so we perform a simple
 * count query. If tags are used by other entities in the future, this will
 * need to be refactored to aggregate counts from multiple sources.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<Params> }
) {
  const { project_id: project_id_param } = await context.params;
  const project_id = Number(project_id_param);
  if (!Number.isFinite(project_id)) return notFound();

  const client = await createClient();
  const ciamClient = await createCIAMClient();

  // Query 1: Get all tags for the project
  const { data: tags, error: tags_err } = await client
    .from("tag")
    .select("*")
    .eq("project_id", project_id);

  if (tags_err || !tags) {
    return notFound();
  }

  // Query 2: Get usage counts from customer_tag grouped by tag_name
  const { data: usageCounts, error: usage_err } = await ciamClient
    .from("customer_tag")
    .select("tag_name")
    .eq("project_id", project_id);

  if (usage_err) {
    return NextResponse.json(
      { error: "Failed to fetch tag usage counts", details: usage_err },
      { status: 500 }
    );
  }

  // Count occurrences of each tag_name
  const usageMap = new Map<string, number>();
  if (usageCounts) {
    for (const item of usageCounts) {
      if (item.tag_name) {
        usageMap.set(item.tag_name, (usageMap.get(item.tag_name) || 0) + 1);
      }
    }
  }

  // Combine tags with usage counts
  const tagsWithUsage = tags.map((tag) => ({
    ...tag,
    usage_count: usageMap.get(tag.name) || 0,
  })) satisfies Platform.Tag.TagWithUsageCount[];

  return NextResponse.json({
    data: tagsWithUsage,
    error: null,
  });
}
