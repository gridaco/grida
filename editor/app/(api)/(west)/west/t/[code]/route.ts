import { Platform } from "@/lib/platform";
import { grida_west_client } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

type Params = {
  code: string;
};

type Context = {
  params: Promise<Params>;
};

export async function GET(req: NextRequest, context: Context) {
  const { code } = await context.params;
  const headersList = await headers();
  const series_id = headersList.get("x-grida-west-campaign-id");

  if (!series_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: token, error: token_test_err } = await grida_west_client
    .from("token")
    .select(
      `
      *,
      campaign:campaign_public!series_id (*),
      owner:participant_public!owner_id (*),
      parent:parent_id(
        owner:participant_public!owner_id (*)
      ),
      children:token!parent_id (
        *,
        owner:participant_public!owner_id (*)
      )
    `
    )
    .eq("code", code)
    .eq("series_id", series_id)
    .single();

  if (token_test_err) {
    console.error(token_test_err);
    return NextResponse.json({ error: token_test_err }, { status: 404 });
  }

  const { campaign, parent, children, ..._token } = token;

  return NextResponse.json({
    data: {
      token: _token,
      campaign,
      parent,
      children,
    } as unknown as Platform.WEST.TokenPublicRead,
    error: null,
  });
}
