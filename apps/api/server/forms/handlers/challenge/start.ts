import { resend } from "../../clients/resend/index";
import TenantCIAMEmailVerification, {
  subject,
  supported_languages,
  type CIAMVerificationEmailLang,
} from "@workspace/emails/ciam-verification";
import { otp6 } from "@workspace/utils/otp";
import { service_role } from "../../db";
import { select_lang } from "@workspace/translations/forms";
import { getLocale } from "@workspace/translations/forms";
import {
  challengeEmailStateKey,
  loadChallengeEmailContext,
  normalizeEmail,
} from "./context";

type Params = { session: string; field: string };

export async function POST(req: Request, params: Params) {
  const { session: sessionId, field: fieldId } = params;

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
    return Response.json({ error: "not found" }, { status: 404 });
  }

  if (ctx.field.type !== "challenge_email") {
    return Response.json({ error: "invalid field type" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
  } | null;

  const emailInput = body?.email;
  if (!emailInput) {
    return Response.json({ error: "email is required" }, { status: 400 });
  }

  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    return Response.json({ error: "email is invalid" }, { status: 400 });
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
    }
  } else if (customerLookupError) {
    // Avoid enumeration/leaking; still proceed with generic response.
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
    // Generic failure (do not enumerate)
    return Response.json(
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

  if (!formDoc) {
    return Response.json({ error: "form not found" }, { status: 404 });
  }

  // Resolve brand info for email sender/display.
  // Prefer published tenant branding (`www.title` / `www.publisher`) when available,
  // otherwise fall back to a generic placeholder. (Do not expose internal project names.)
  const { data: www_list, error: www_err } = await service_role.www
    .from("www")
    .select("title, publisher, lang")
    .eq("project_id", ctx.form.project_id)
    .limit(1);

  const www = !www_err && www_list && www_list.length > 0 ? www_list[0] : null;

  const brand_name =
    www && typeof www.title === "string" && www.title
      ? String(www.title)
      : "(Untitled)";

  const publisher =
    www && typeof www.publisher === "string" && www.publisher
      ? String(www.publisher)
      : "";
  const brand_support_url =
    publisher.startsWith("http://") || publisher.startsWith("https://")
      ? publisher
      : undefined;
  const brand_support_contact = publisher.includes("@") ? publisher : undefined;

  // Prefer the per-form document language when set; otherwise fall back to tenant/published `www.lang`.
  // (Treat empty strings as "unset".)
  const langCandidate = formDoc.lang?.trim() || www?.lang?.trim() || null;
  // Prefer the visitor's device language. If unsupported, fall back to the form/tenant default.
  const fallback_lang = select_lang(langCandidate, supported_languages, "en");
  const emailLang: CIAMVerificationEmailLang = await getLocale(
    req.headers,
    [...supported_languages],
    fallback_lang
  );
  const { error: resend_err } = await resend.emails.send({
    from: `${brand_name} <no-reply@accounts.grida.co>`,
    to: email,
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
    // Still allow verify attempts; OTP exists in DB.
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

  return Response.json({
    challenge_id,
    expires_at,
    state,
  });
}
