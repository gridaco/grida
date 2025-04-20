import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { createFormsClient } from "@/lib/supabase/server";
import { get_grida_table_x_supabase_table_connector } from "@/services/x-supabase";
import {
  XSupabaseStorageCrossBucketTaskPooler,
  XSupabaseStorageTaskPoolerResult,
} from "@/services/x-supabase/xsb-storage-pooler";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  form_id: string;
  sb_table_id: string;
};

type Context = {
  params: Promise<Params>;
};

interface XSBStorageBulkResolverRequest {
  rows: Record<string, any>[];
}

export async function POST(req: NextRequest, context: Context) {
  const formsClient = await createFormsClient();
  const { form_id, sb_table_id: _sb_table_id } = await context.params;
  const sb_table_id = parseInt(_sb_table_id);

  const body: XSBStorageBulkResolverRequest = await req.json();

  try {
    const { grida_table, main_supabase_table, x_client, x_storage_client } =
      await get_grida_table_x_supabase_table_connector({
        form_id,
        sb_table_id: sb_table_id,
        client: formsClient,
      });

    const { fields } = grida_table;

    const { pk_col, pk_first_col } = SupabasePostgRESTOpenApi.parse_pks(
      main_supabase_table.sb_table_schema
    );

    const pooler = new XSupabaseStorageCrossBucketTaskPooler(x_storage_client);
    pooler.queue(fields, body.rows, (pk_col || pk_first_col)!);

    try {
      const xsb_storage_files: XSupabaseStorageTaskPoolerResult | null =
        await pooler.resolve();

      return NextResponse.json({ data: xsb_storage_files });
    } catch (e) {
      console.error("ERR 400 storage/pooler", e);
      return NextResponse.json({ error: true }, { status: 400 });
    }
  } catch (e) {
    console.error("ERR 500 storage/pooler", e);
    return NextResponse.json({ error: true }, { status: 500 });
  }
}
