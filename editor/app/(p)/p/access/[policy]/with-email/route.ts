import { NextRequest, NextResponse } from "next/server";
import { workspaceclient } from "@/lib/supabase/server";
import { resend } from "@/clients/resend";
import EmailTemplateCustomerPortalVerification from "@/theme/templates-email/customer-portal-verification/default";

// TODO: add rate limiting
export async function POST(req: NextRequest) {
  const jsonbody = await req.json();
  const { email } = jsonbody;

  const brand_name = "Grida";

  // TODO: scope by policy / project
  const { data: customer_list, error: customer_list_err } =
    await workspaceclient.from("customer").select().eq("email", email);

  if (customer_list_err) {
    // return ok, cause we don't want to leak if the email is registered or not
    return NextResponse.json({
      data: null,
      error: null,
      message: "ok",
    });
  }

  if (customer_list.length !== 1) {
    console.error(
      `[portal]/ignore while fetching customer by email (${customer_list.length}) found`
    );
    // return ok, cause we don't want to leak if the email is registered or not
    return NextResponse.json({
      data: null,
      error: null,
      message: "ok",
    });
  }

  const customer = customer_list[0];

  const { data: linkdata, error: linkerror } =
    await workspaceclient.auth.admin.generateLink({
      type: "magiclink",
      email: email,
      options: {
        data: {
          ["customer_portal_customer_uid"]: customer.uid,
        },
      },
    });

  if (linkerror) {
    console.error("[portal]/error while generating otp", linkerror);
    return NextResponse.error();
  }

  // unverified user is created (or fetched) with the email
  const {
    user,
    properties: { email_otp },
  } = linkdata;

  // link the user to the customer
  const { error: customer_user_link_err } = await workspaceclient
    .from("customer")
    .update({
      user_id: user.id,
    })
    .eq("uid", customer.uid)
    .eq("email", email)
    .single();

  if (customer_user_link_err) {
    console.error(
      "[portal]/error while linking customer to user",
      customer_user_link_err
    );
    return NextResponse.error();
  }

  const { error: resend_err } = await resend.emails.send({
    from: `${brand_name} <no-reply@accounts.grida.co>`,
    to: email,
    subject: `${email_otp} - ${brand_name} Sign-in Verification`,
    react: EmailTemplateCustomerPortalVerification({ email_otp, brand_name }),
  });

  if (resend_err) {
    console.error("[portal]/error while sending email", resend_err, email);
    return NextResponse.error();
  }

  return NextResponse.json({
    data: null,
    error: null,
    message: "ok",
  });
}
