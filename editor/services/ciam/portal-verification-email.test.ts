import { describe, expect, test } from "vitest";
import { renderPortalVerificationEmail } from "./portal-verification-email";

describe("portal-verification-email", () => {
  const baseContext = {
    email_otp: "123456",
    brand_name: "Acme Co",
    customer_name: "Alice",
    expires_in_minutes: 10,
    brand_support_url: "https://acme.co/support",
    brand_support_contact: "support@acme.co",
  };

  test("renders handlebars variables in subject and body", () => {
    const { subject, html } = renderPortalVerificationEmail({
      subject_template: "{{email_otp}} - {{brand_name}} code",
      body_html_template:
        "<p>Hi {{customer_name}}, your code is {{email_otp}}. Expires in {{expires_in_minutes}} min.</p>",
      context: baseContext,
    });

    expect(subject).toBe("123456 - Acme Co code");
    expect(html).toBe(
      "<p>Hi Alice, your code is 123456. Expires in 10 min.</p>"
    );
  });

  test("uses default subject when subject_template is null", () => {
    const { subject } = renderPortalVerificationEmail({
      subject_template: null,
      body_html_template: "<p>Code: {{email_otp}}</p>",
      context: baseContext,
    });

    expect(subject).toBe("123456 - Acme Co verification code");
  });

  test("handles optional context fields gracefully", () => {
    const { html } = renderPortalVerificationEmail({
      subject_template: null,
      body_html_template:
        "<p>{{customer_name}} {{brand_support_url}} {{brand_support_contact}}</p>",
      context: {
        email_otp: "999999",
        brand_name: "Test",
        expires_in_minutes: 5,
        // customer_name, brand_support_url, brand_support_contact omitted
      },
    });

    // Omitted values render as empty strings
    expect(html).toBe("<p>  </p>");
  });
});
