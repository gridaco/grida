import { unwrapFeildValue } from "@/lib/forms/unwrap";
import { client } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const { data: forms } = await client.from("form").select("id");

  let i = 1;
  for (const form of forms!) {
    console.log(`===== ${i} / ${forms?.length} =====`);

    const { data } = await client
      .from("response_field")
      .select("id, type, value")
      .eq("form_id", form.id);

    let ii = 1;
    for (const rf of data!) {
      const { type, value } = rf;
      const unwrapped = unwrapFeildValue(value, type);

      await client
        .from("response_field")
        .update({ value: unwrapped as any })
        .eq("id", rf.id);

      console.log(`${ii} of ${data?.length}:`, "processed", rf.id);
      ii++;
    }

    i++;
  }

  return NextResponse.json({
    message: "ok",
  });
}
