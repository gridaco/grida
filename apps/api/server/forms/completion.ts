import { FormResponseContacts } from "@grida/forms";
import { service_role } from "./db";
import { RawdataProcessing } from "./grida-forms/lib/rawdata";
import { renderRespondentEmail } from "./services/form/respondent-email";
import { resend } from "./clients/resend";
import validator from "validator";

/** Required submission completion. These operations are not HTTP endpoints. */
export namespace OnSubmit {
  export async function clearsession({
    form_id,
    response_id,
    session_id,
  }: {
    form_id: string;
    response_id: string;
    session_id: string;
  }) {
    const { data: form, error: formError } = await service_role.forms
      .from("form")
      .select("id, fields:attribute(*)")
      .eq("id", form_id)
      .single();
    if (formError || !form)
      throw new Error("Unable to synchronize response session");
    const { data: response, error } = await service_role.forms
      .from("response")
      .select("raw")
      .eq("id", response_id)
      .eq("form_id", form_id)
      .eq("session_id", session_id)
      .single();
    if (error || !response)
      throw new Error("Unable to synchronize response session");
    const { data: updated, error: updateError } = await service_role.forms
      .from("response_session")
      .update({
        raw: response.raw
          ? (RawdataProcessing.namekeytoidkey(
              response.raw as Record<string, unknown>,
              form.fields
            ) as Record<string, string>)
          : {},
      })
      .eq("id", session_id)
      .eq("form_id", form_id)
      .select("id")
      .single();
    if (updateError || !updated)
      throw new Error("Unable to synchronize response session");
  }

  export async function postindexing({
    form_id,
    response_id,
  }: {
    form_id: string;
    response_id: string;
  }) {
    const { data: response, error } = await service_role.forms
      .from("response")
      .select(
        "customer_id, raw, response_fields:response_field(challenge_state, form_field:attribute(type, name))"
      )
      .eq("id", response_id)
      .eq("form_id", form_id)
      .single();
    if (error || !response) throw new Error("Unable to index response");
    if (!response.customer_id) return;
    const { data: form, error: formError } = await service_role.forms
      .from("form")
      .select("project_id")
      .eq("id", form_id)
      .single();
    if (formError || !form) throw new Error("Unable to index response");
    const { data: customer, error: customerError } =
      await service_role.workspace
        .from("customer")
        .select("email_provisional, phone_provisional")
        .eq("uid", response.customer_id)
        .eq("project_id", form.project_id)
        .single();
    if (customerError || !customer) throw new Error("Unable to index response");
    const { email_provisional: emails, phone_provisional: phones } =
      FormResponseContacts.provisional([
        {
          raw: response.raw as Record<string, unknown> | null,
          response_fields: response.response_fields,
        },
      ]);
    const { error: updateError } = await service_role.workspace
      .from("customer")
      .update({
        email_provisional: [
          ...new Set([...customer.email_provisional, ...emails]),
        ],
        phone_provisional: [
          ...new Set([...customer.phone_provisional, ...phones]),
        ],
      })
      .eq("uid", response.customer_id)
      .eq("project_id", form.project_id);
    if (updateError) throw new Error("Unable to index response");
  }

  export async function notification_respondent_email({
    form_id,
    response_id,
  }: {
    form_id: string;
    response_id: string;
  }) {
    const { data: form, error: formError } = await service_role.forms
      .from("form")
      .select("id, project_id, title, notification_respondent_email")
      .eq("id", form_id)
      .single();
    if (formError || !form) throw new Error("Unable to send receipt");
    const cfg = form.notification_respondent_email;
    if (!cfg.enabled) return;
    const { data: response, error } = await service_role.forms
      .from("response")
      .select("raw, local_index, local_id, customer_id")
      .eq("id", response_id)
      .eq("form_id", form_id)
      .single();
    if (error || !response) throw new Error("Unable to send receipt");
    if (!response.customer_id) return;
    const { data: customer, error: customerError } =
      await service_role.workspace
        .from("customer")
        .select("email, is_email_verified")
        .eq("uid", response.customer_id)
        .eq("project_id", form.project_id)
        .single();
    if (customerError || !customer) throw new Error("Unable to send receipt");
    const to = customer.email?.trim();
    if (!to || !customer.is_email_verified || !validator.isEmail(to)) return;
    const htmlSource = cfg.body_html_template?.trim();
    if (!htmlSource) return;
    const { subject, html } = renderRespondentEmail({
      form_title: form.title,
      raw: (response.raw ?? {}) as Record<string, unknown>,
      response_local_index: Number(response.local_index ?? 0),
      response_local_id: response.local_id ?? null,
      subject_template: cfg.subject_template ?? null,
      body_html_template: htmlSource,
    });
    const replyTo = cfg.reply_to?.trim();
    const { error: sendError } = await resend.emails.send({
      from: `${cfg.from_name?.trim() || "Grida Forms"} <no-reply@accounts.grida.co>`,
      to: [to],
      subject,
      html,
      replyTo: replyTo && validator.isEmail(replyTo) ? replyTo : undefined,
      tags: [
        { name: "type", value: "notification_respondent_email" },
        { name: "form_id", value: form_id },
      ],
    });
    if (sendError) throw new Error("Unable to send receipt");
  }
}
