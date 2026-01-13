import { NextRequest, NextResponse } from "next/server";
import { resend } from "@/clients/resend";
import TenantCIAMEmailVerification, {
  subject,
  supported_languages,
  type CIAMVerificationEmailLang,
} from "@/theme/templates-email/ciam-verifiaction/default";
import { otp6 } from "@/lib/crypto/otp";
import { service_role } from "@/lib/supabase/server";
import { select_lang } from "@/i18n/utils";
import {
  challengeEmailStateKey,
  loadChallengeEmailContext,
  normalizeEmail,
} from "../_utils";

type Params = { session: string; field: string };

export async function POST(
  req: NextRequest,
  context: { params: Promise<Params> }
) {
  const { session: sessionId, field: fieldId } = await context.params;

  // TODO(security): add rate limiting / abuse protection for OTP start.
  // This endpoint is public and can be abused to spam arbitrary emails by creating
  // sessions and repeatedly calling `start`. Options:
  // - DB-enforced per-(project_id,email) and per-IP cooldown
  // - edge/middleware rate limiting
  // - CAPTCHA / proof-of-work for public forms
  const { data: ctx, error } = await loadChallengeEmailContext({
    sessionId,
    fieldId,
  });

  if (error || !ctx) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (ctx.field.type !== "challenge_email") {
    return NextResponse.json({ error: "invalid field type" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
  } | null;

  const emailInput = body?.email;
  if (!emailInput) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email is invalid" }, { status: 400 });
  }

  // Sign-up behavior: ensure a customer exists.
  const { data: existingCustomers, error: customerLookupError } =
    await service_role.workspace
      .from("customer")
      .select("uid")
      .eq("project_id", ctx.form.project_id)
      .eq("email", email)
      .order("uid")
      .limit(1);

  if (
    !customerLookupError &&
    (!existingCustomers || existingCustomers.length === 0)
  ) {
    const derivedName = email.split("@")[0]?.slice(0, 64) || "Customer";
    const { error: createCustomerError } = await service_role.workspace
      .from("customer")
      .insert({
        project_id: ctx.form.project_id,
        email,
        name: derivedName,
      });

    if (createCustomerError) {
      // Avoid leaking anything; still proceed with generic response.
      console.error(
        "[forms][challenge_email]/error creating customer",
        createCustomerError
      );
    }
  } else if (customerLookupError) {
    // Avoid enumeration/leaking; still proceed with generic response.
    console.error(
      "[forms][challenge_email]/error looking up customer",
      customerLookupError
    );
  }

  const otp = otp6();
  const expires_in_minutes = 10;

  const { data: challenge_id, error: challenge_error } =
    await service_role.ciam.rpc("create_customer_otp_challenge", {
      p_project_id: ctx.form.project_id,
      p_email: email,
      p_otp: otp,
      p_expires_in_seconds: expires_in_minutes * 60,
    });

  if (challenge_error || !challenge_id) {
    console.error(
      "[forms][challenge_email]/error creating OTP challenge",
      challenge_error
    );
    // Generic failure (do not enumerate)
    return NextResponse.json(
      { error: "unable to start challenge" },
      { status: 500 }
    );
  }

  // Best-effort language from form configuration (fallback: en)
  const { data: formDoc } = await service_role.forms
    .from("form_document")
    .select("lang")
    .eq("form_id", ctx.form.id)
    .single();
  const emailLang: CIAMVerificationEmailLang = select_lang(
    (formDoc as { lang?: unknown } | null)?.lang,
    supported_languages,
    "en"
  );

  const brand_name = "Grida";
  const { error: resend_err } = await resend.emails.send({
    from: `${brand_name} <no-reply@accounts.grida.co>`,
    to: email,
    subject: subject(emailLang, { brand_name, email_otp: otp }),
    react: TenantCIAMEmailVerification({
      email_otp: otp,
      brand_name,
      expires_in_minutes,
      lang: emailLang,
    }),
  });

  if (resend_err) {
    // Still allow verify attempts; OTP exists in DB.
    console.error("[forms][challenge_email]/error sending email", resend_err);
  }

  const expires_at = new Date(
    Date.now() + expires_in_minutes * 60 * 1000
  ).toISOString();
  const key = challengeEmailStateKey(fieldId);
  const state = {
    state: "challenge-session-started" as const,
    email,
    challenge_id,
    expires_at,
    verified_at: null,
    customer_uid: null,
  };

  await service_role.forms.rpc("set_response_session_field_value", {
    session_id: sessionId,
    key,
    value: state,
  });

  return NextResponse.json({
    challenge_id,
    expires_at,
    state,
  });
}
