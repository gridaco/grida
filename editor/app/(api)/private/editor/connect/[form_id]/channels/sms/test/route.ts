import { OnSubmitProcessors } from "@/app/(api)/submit/[id]/hooks";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  form_id: string;
};

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { data: getuser } = await supabase.auth.getUser();
  if (!getuser.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
      }
    );
  }

  const { form_id } = await context.params;
  const body = await req.json();

  const { to, message } = body;

  let res;
  if (message) {
    res = await OnSubmitProcessors.send_sms({
      type: "custom",
      text: message,
      form_id,
      to: to,
      lang: "en",
    });
  } else {
    res = await OnSubmitProcessors.send_sms({
      type: "formcomplete",
      form_id,
      to: to,
      lang: "en",
    });
  }

  console.log("smstest:", res);

  NextResponse.json({ message: "SMS sent successfully" });
}
