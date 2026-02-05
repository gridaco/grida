import { NextRequest, NextResponse } from "next/server";
import assert from "assert";
import { notFound } from "next/navigation";
import validator from "validator";
import { service_role } from "@/lib/supabase/server";
import { resend } from "@/clients/resend";
import { renderRespondentEmail } from "@/services/form/respondent-email";

type Params = { id: string };

/**
 * Guard this public hook endpoint with a shared S2S key.
 *
 * This route uses `service_role` and can send emails, so it must not be
 * callable by arbitrary third-parties.
 */
const GRIDA_S2S_PRIVATE_API_KEY = process.env.GRIDA_S2S_PRIVATE_API_KEY;

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const provided =
    req.headers.get("x-grida-s2s-key") ?? req.headers.get("x-hook-secret");
  if (!GRIDA_S2S_PRIVATE_API_KEY) {
    console.error(
      "notification-respondent-email/err/misconfigured: GRIDA_S2S_PRIVATE_API_KEY missing"
    );
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!provided) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (provided !== GRIDA_S2S_PRIVATE_API_KEY) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const { id: form_id } = await context.params;
  const { response_id } = await req.json();

  assert(form_id, "form_id is required");
  assert(response_id, "response_id is required");

  const { data: form, error: form_err } = await service_role.forms
    .from("form")
    .select(
      `
      id,
      title,
      notification_respondent_email,
      fields:attribute(id, name, type)
    `
    )
    .eq("id", form_id)
    .single();

  if (form_err)
    console.error("notification-respondent-email/err/form", form_err);
  if (!form) return notFound();

  const cfg = form.notification_respondent_email;

  if (!cfg.enabled) {
    return NextResponse.json(
      { ok: true, skipped: "disabled" },
      { status: 200 }
    );
  }

  const { data: response, error: response_err } = await service_role.forms
    .from("response")
    .select("id, form_id, raw, local_index, local_id, customer_id")
    .eq("id", response_id)
    .eq("form_id", form_id)
    .single();

  if (response_err)
    console.error("notification-respondent-email/err/response", response_err);
  if (!response) return notFound();

  const customer_id = response.customer_id?.trim() || null;
  if (!customer_id) {
    return NextResponse.json(
      { ok: true, skipped: "missing_customer" },
      { status: 200 }
    );
  }

  const { data: customer, error: customer_err } = await service_role.workspace
    .from("customer")
    .select("uid, email, is_email_verified")
    .eq("uid", customer_id)
    .single();

  if (customer_err)
    console.error("notification-respondent-email/err/customer", customer_err);
  if (!customer) return notFound();

  const to = (customer.email ?? "").trim();
  if (!to || !customer.is_email_verified || !validator.isEmail(to)) {
    return NextResponse.json(
      { ok: true, skipped: "unverified_email" },
      { status: 200 }
    );
  }

  const raw = (response.raw ?? {}) as Record<string, unknown>;

  const htmlSource = cfg.body_html_template?.trim();
  if (!htmlSource) {
    return NextResponse.json(
      { ok: true, skipped: "missing_body_template" },
      { status: 200 }
    );
  }

  const { subject, html } = renderRespondentEmail({
    form_title: form.title,
    raw,
    response_local_index: Number(response.local_index ?? 0),
    response_local_id: response.local_id ?? null,
    subject_template: cfg.subject_template ?? null,
    body_html_template: htmlSource,
  });

  const replyTo = cfg.reply_to?.trim() || undefined;
  const replyToSafe =
    replyTo && validator.isEmail(replyTo) ? replyTo : undefined;

  const fromName = cfg.from_name?.trim() || "Grida Forms";

  try {
    await resend.emails.send({
      from: `${fromName} <no-reply@accounts.grida.co>`,
      to: [to],
      subject,
      html,
      replyTo: replyToSafe,
      tags: [
        { name: "type", value: "notification_respondent_email" },
        { name: "form_id", value: form_id },
      ],
    });
  } catch (e) {
    console.error("notification-respondent-email/err/send", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
