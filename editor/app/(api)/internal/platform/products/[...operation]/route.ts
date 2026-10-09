import { handleProductReceipts } from "@/lib/platform/product-receipts";
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
      process.env.GRIDA_PLATFORM_RECEIPTS_WORKLOAD_KEYS ?? "null"
    );
  } catch {
    keys = null;
  }
  return handleProductReceipts(
    request,
    (await context.params).operation.join("/"),
    {
      environment: process.env.GRIDA_PLATFORM_RECEIPTS_ENVIRONMENT ?? "",
      keys,
    },
    async (name, args) =>
      await service_role.workspace.rpc(name as never, args as never)
  );
}
