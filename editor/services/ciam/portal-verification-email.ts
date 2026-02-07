import { render } from "@/lib/templating/template";

export interface PortalVerificationEmailContext {
  email_otp: string;
  brand_name: string;
  customer_name?: string;
  expires_in_minutes: number;
  brand_support_url?: string;
  brand_support_contact?: string;
}

/**
 * Render an admin-authored portal verification email using Handlebars.
 *
 * Supported template variables:
 * - `{{email_otp}}` – OTP code
 * - `{{brand_name}}` – tenant site title
 * - `{{customer_name}}` – optional
 * - `{{expires_in_minutes}}` – OTP expiry
 * - `{{brand_support_url}}` – optional
 * - `{{brand_support_contact}}` – optional
 */
export function renderPortalVerificationEmail({
  subject_template,
  body_html_template,
  context,
}: {
  subject_template: string | null;
  body_html_template: string;
  context: PortalVerificationEmailContext;
}) {
  const vars = {
    email_otp: context.email_otp,
    brand_name: context.brand_name,
    customer_name: context.customer_name ?? "",
    expires_in_minutes: String(context.expires_in_minutes),
    brand_support_url: context.brand_support_url ?? "",
    brand_support_contact: context.brand_support_contact ?? "",
  };

  const subjectSource =
    subject_template?.trim() ||
    `{{email_otp}} - {{brand_name}} verification code`;
  const htmlSource = body_html_template.trim();

  return {
    subject: render(subjectSource, vars as any),
    html: render(htmlSource, vars as any),
  };
}
