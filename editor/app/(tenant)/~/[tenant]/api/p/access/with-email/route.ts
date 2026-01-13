import { NextRequest, NextResponse } from "next/server";
import { service_role } from "@/lib/supabase/server";
import { resend } from "@/clients/resend";
import EmailTemplateCIAMVerification from "@/theme/templates-email/ciam-verifiaction/default";
import { otp6 } from "@/lib/crypto/otp";
// TODO: add rate limiting
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const jsonbody = await req.json();
  const { email } = jsonbody;

  const brand_name = "Grida";

  const emailNormalized = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!emailNormalized) {
    return NextResponse.json({ data: null, error: null, message: "ok" });
  }

  const { tenant } = await params;
  const { data: www, error: wwwErr } = await service_role.www
    .from("www")
    .select("project_id")
    .eq("name", tenant)
    .single();

  if (wwwErr || !www) {
    console.error(
      "[portal]/error (ok) while resolving tenant www",
      tenant,
      wwwErr
    );
    return NextResponse.json({ data: null, error: null, message: "ok" });
  }

  const projectId = Number((www as any).project_id);
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ data: null, error: null, message: "ok" });
  }

  // Customer portal access: existing customers only.
  const { data: customer_list, error: customer_list_err } =
    await service_role.workspace
      .from("customer")
      .select("uid, name")
      .eq("project_id", projectId)
      .eq("email", emailNormalized)
      .order("uid");

  if (customer_list_err) {
    console.error(
      "[portal]/error (ok) while fetching customer by email",
      customer_list_err,
      emailNormalized
    );
    // return ok, cause we don't want to leak if the email is registered or not
    return NextResponse.json({
      data: null,
      error: null,
      message: "ok",
    });
  }

  let customer: { uid: string; name?: string | null } | null = null;
  if (customer_list.length === 0) {
    // return ok, cause we don't want to leak if the email is registered or not
    return NextResponse.json({
      data: null,
      error: null,
      message: "ok",
    });
  } else if (customer_list.length === 1) {
    customer = customer_list[0];
  } else if (customer_list.length > 1) {
    // Multiple customers with same email in the same project is a known issue.
    // Pick the first deterministically.
    customer = customer_list[0];
  }

  if (!customer) {
    return NextResponse.json({ data: null, error: null, message: "ok" });
  }

  // Create CIAM OTP challenge (do NOT use Supabase Auth).
  const otp = otp6();
  const expires_in_minutes = 10;
  const { data: challenge_id, error: challenge_error } =
    await service_role.ciam.rpc("create_customer_otp_challenge", {
      p_project_id: projectId,
      p_email: emailNormalized,
      p_otp: otp,
      p_expires_in_seconds: expires_in_minutes * 60,
    });

  if (challenge_error) {
    console.error(
      "[portal]/error (ok) while creating otp challenge",
      challenge_error
    );
    // return ok, cause we don't want to leak if the email is registered or not
    return NextResponse.json({ data: null, error: null, message: "ok" });
  }

  const acceptLanguage = req.headers.get("accept-language") ?? "";
  const emailLang = acceptLanguage.toLowerCase().includes("ko") ? "ko" : "en";

  const { error: resend_err } = await resend.emails.send({
    from: `${brand_name} <no-reply@accounts.grida.co>`,
    to: emailNormalized,
    subject:
      emailLang === "ko"
        ? `${otp} - ${brand_name} 인증 코드`
        : `${otp} - ${brand_name} Verification`,
    react: EmailTemplateCIAMVerification({
      email_otp: otp,
      brand_name,
      expires_in_minutes,
      lang: emailLang,
      userName: customer.name ?? undefined,
    }),
  });

  if (resend_err) {
    console.error("[portal]/error while sending email", resend_err, email);
    // return ok, cause we don't want to leak if the email is registered or not
    return NextResponse.json({ data: null, error: null, message: "ok" });
  }

  return NextResponse.json({
    data: null,
    error: null,
    message: "ok",
    challenge_id,
  });
}
