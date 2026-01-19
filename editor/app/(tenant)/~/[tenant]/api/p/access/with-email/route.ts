import { NextRequest, NextResponse } from "next/server";
import { service_role } from "@/lib/supabase/server";
import { resend } from "@/clients/resend";
import TenantCustomerPortalAccessEmailVerification, {
  subject,
  supported_languages,
  type CustomerPortalVerificationEmailLang,
} from "@/theme/templates-email/customer-portal-verification/default";
import { otp6 } from "@/lib/crypto/otp";
import { select_lang } from "@/i18n/utils";
import { getLocale } from "@/i18n/server";
// TODO: add rate limiting
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const jsonbody = await req.json();
  const { email } = jsonbody;

  const emailNormalized = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!emailNormalized) {
    return NextResponse.json({ data: null, error: null, message: "ok" });
  }

  const { tenant } = await params;
  const { data: www, error: wwwErr } = await service_role.www
    .from("www")
    .select("project_id, title, publisher, lang")
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

  const projectId = Number(www.project_id);
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ data: null, error: null, message: "ok" });
  }

  const brand_name =
    typeof www.title === "string" && www.title
      ? String(www.title)
      : "(Untitled)";

  // Customer portal access: existing customers only.
  // Prefer verified customer if duplicates exist (legacy data).
  // TODO(security/identity): once we have an admin UI + policy for managing email verification,
  // we should filter to `is_email_verified = true` (not just sort), to ensure portal access
  // is only granted to verified identities. For now we only sort because legacy tenants can
  // have duplicates and not all projects have a verified-email-only policy yet.
  const { data: customer_list, error: customer_list_err } =
    await service_role.workspace
      .from("customer")
      .select("uid, name, is_email_verified")
      .eq("project_id", projectId)
      .eq("email", emailNormalized)
      .order("is_email_verified", { ascending: false })
      .order("uid")
      .limit(1);

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

  let customer: {
    uid: string;
    name?: string | null;
    is_email_verified?: boolean | null;
  } | null = null;
  if (customer_list.length === 0) {
    // return ok, cause we don't want to leak if the email is registered or not
    return NextResponse.json({
      data: null,
      error: null,
      message: "ok",
    });
  } else {
    // Deterministic: the query already prefers verified customers.
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

  // Tenant support info (optional). `www.publisher` isn't strictly "support",
  // but can be used as a tenant-provided contact/URL when available.
  const publisher =
    typeof www.publisher === "string" && www.publisher
      ? String(www.publisher)
      : "";
  const brand_support_url =
    publisher.startsWith("http://") || publisher.startsWith("https://")
      ? publisher
      : undefined;
  const brand_support_contact = publisher.includes("@") ? publisher : undefined;

  // Prefer the visitor's device language. If unsupported, fall back to the tenant default.
  const fallback_lang = select_lang(www.lang, supported_languages, "en");
  const emailLang: CustomerPortalVerificationEmailLang = await getLocale(
    [...supported_languages],
    fallback_lang
  );

  const { error: resend_err } = await resend.emails.send({
    from: `${brand_name} <no-reply@accounts.grida.co>`,
    to: emailNormalized,
    subject: subject(emailLang, {
      brand_name,
      email_otp: otp,
    }),
    react: TenantCustomerPortalAccessEmailVerification({
      email_otp: otp,
      customer_name: customer.name ?? undefined,
      brand_name: brand_name,
      brand_support_url,
      brand_support_contact,
      lang: emailLang,
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
