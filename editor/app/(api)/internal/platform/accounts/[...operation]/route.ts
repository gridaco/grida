import { handleCanonical } from "@/lib/platform/canonical";
import { service_role } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ operation: string[] }> }
) {
  let keys: unknown;
  try {
    keys = JSON.parse(
      process.env.GRIDA_PLATFORM_CANONICAL_WORKLOAD_KEYS ?? "null"
    );
  } catch {
    keys = null;
  }
  return handleCanonical(
    request,
    (await context.params).operation.join("/"),
    {
      environment: process.env.GRIDA_PLATFORM_CANONICAL_ENVIRONMENT ?? "",
      keys,
    },
    async (name, args) => {
      // This closed union is the only privileged source surface exposed here.
      // Generated database types acquire these additive RPCs at schema generation.
      return service_role.workspace.rpc(name as never, args as never);
    }
  );
}
