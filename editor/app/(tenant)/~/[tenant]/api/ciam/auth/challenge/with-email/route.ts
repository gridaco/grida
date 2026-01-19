import { NextRequest, NextResponse } from "next/server";
import { service_role } from "@/lib/supabase/server";
import { resend } from "@/clients/resend";
import TenantCIAMEmailVerification, {
  subject,
  supported_languages,
  type CIAMVerificationEmailLang,
} from "@/theme/templates-email/ciam-verifiaction/default";
import { otp6 } from "@/lib/crypto/otp";
import { select_lang } from "@/i18n/utils";
import { getLocale } from "@/i18n/server";

/**
 * POST /api/ciam/auth/challenge/with-email
 *
 * Creates an OTP challenge and sends a verification email.
 *
 * Body: { email: string }
 * Returns: { success: true, message: "ok", challenge_id: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const emailNormalized = String(email).trim().toLowerCase();
    if (!emailNormalized) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const { tenant } = await params;

    // Tenant in this router corresponds to `grida_www.www.name`.
    const { data: www, error: wwwErr } = await service_role.www
      .from("www")
      .select("project_id, title, publisher, lang")
      .eq("name", tenant)
      .single();
    if (wwwErr || !www) {
      console.error("[ciam]/error resolving tenant www", tenant, wwwErr);
      return NextResponse.json({ error: "tenant not found" }, { status: 404 });
    }

    const projectId = Number(www.project_id);
    if (!Number.isFinite(projectId)) {
      return NextResponse.json({ error: "tenant not found" }, { status: 404 });
    }

    // Sign-up behavior:
    // Ensure a customer exists for this (project_id, email) before issuing OTP.
    const { data: existingCustomers, error: customerLookupError } =
      await service_role.workspace
        .from("customer")
        .select("uid")
        .eq("project_id", projectId)
        .eq("email", emailNormalized)
        .order("uid")
        .limit(1);

    if (customerLookupError) {
      console.error("[ciam]/error looking up customer", customerLookupError);
      // Return success anyway to prevent enumeration
      return NextResponse.json({ success: true, message: "ok" });
    }

    if (!existingCustomers || existingCustomers.length === 0) {
      const derivedName =
        emailNormalized.split("@")[0]?.slice(0, 64) || "Customer";
      const { error: createCustomerError } = await service_role.workspace
        .from("customer")
        .insert({
          project_id: projectId,
          email: emailNormalized,
          name: derivedName,
        });

      if (createCustomerError) {
        console.error("[ciam]/error creating customer", createCustomerError);
        // Return success anyway to prevent enumeration
        return NextResponse.json({ success: true, message: "ok" });
      }
    }

    // Generate 6-digit OTP
    const otp = otp6();
    const expires_in_minutes = 10;

    // Create OTP challenge via RPC
    const { data: challenge_id, error: challenge_error } =
      await service_role.ciam.rpc("create_customer_otp_challenge", {
        p_project_id: projectId,
        p_email: emailNormalized,
        p_otp: otp,
        p_expires_in_seconds: expires_in_minutes * 60,
      });

    if (challenge_error) {
      console.error("[ciam]/error creating OTP challenge", challenge_error);
      // Return success anyway to prevent enumeration
      return NextResponse.json({ success: true, message: "ok" });
    }

    // Send email with OTP
    const brand_name = www.title ? String(www.title) : "(Untitled)";

    const publisher = www.publisher ? String(www.publisher) : "";
    const brand_support_url =
      publisher.startsWith("http://") || publisher.startsWith("https://")
        ? publisher
        : undefined;
    const brand_support_contact = publisher.includes("@")
      ? publisher
      : undefined;

    // Prefer the visitor's device language. If unsupported, fall back to the tenant default.
    const fallback_lang = select_lang(www.lang, supported_languages, "en");
    const emailLang: CIAMVerificationEmailLang = await getLocale(
      [...supported_languages],
      fallback_lang
    );
    const { error: resend_err } = await resend.emails.send({
      from: `${brand_name} <no-reply@accounts.grida.co>`,
      to: emailNormalized,
      subject: subject(emailLang, { brand_name, email_otp: otp }),
      react: TenantCIAMEmailVerification({
        email_otp: otp,
        brand_name,
        expires_in_minutes,
        lang: emailLang,
        brand_support_url,
        brand_support_contact,
      }),
    });

    if (resend_err) {
      console.error("[ciam]/error sending email", resend_err);
      // Still return success to prevent enumeration
    }

    return NextResponse.json({ success: true, message: "ok", challenge_id });
  } catch (error) {
    console.error("[ciam]/unexpected error in OTP creation", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
