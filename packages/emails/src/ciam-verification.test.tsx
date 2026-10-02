import { createHash } from "node:crypto";
import { render } from "@react-email/components";
import EmailTemplateCIAMVerification, {
  subject,
  supported_languages,
  type CIAMVerificationEmailProps,
} from "./ciam-verification";
import fingerprints from "./ciam-verification-fingerprints.json";

const base = { email_otp: "123456", brand_name: "Example" };
const html = (props: CIAMVerificationEmailProps) =>
  render(<EmailTemplateCIAMVerification {...props} />);

describe("CIAM verification presentation", () => {
  test("preserves the five languages and localized subjects", () => {
    expect(supported_languages).toEqual(["en", "ko", "es", "ja", "zh"]);
    expect(
      supported_languages.map((language) => subject(language, base))
    ).toEqual([
      "123456 - Example verification code",
      "123456 - Example 인증 코드",
      "123456 - Código de verificación de Example",
      "123456 - Example 確認コード",
      "123456 - Example 验证码",
    ]);
  });

  test.each(supported_languages)(
    "preserves %s HTML with default and complete presentation",
    async (lang) => {
      const cases = {
        minimal: { ...base, lang },
        full: {
          ...base,
          lang,
          customer_name: " Alex ",
          expires_in_minutes: 7,
          brand_support_url: "https://example.com/support",
          brand_support_contact: "help@example.com",
        },
      };
      for (const name of ["minimal", "full"] as const) {
        // Golden fingerprints come from the original template, before relocation.
        expect(
          createHash("sha256")
            .update(await html(cases[name]))
            .digest("hex")
        ).toBe(fingerprints[lang][name]);
      }
    }
  );

  test("defaults to English, ten minutes, and an unnamed greeting", async () => {
    const result = await html(base);
    expect(result).toContain("Hello,");
    expect(result).toContain("This code will expire in 10 minutes.");
    expect(result).not.toContain("Questions?");
    expect(result).toBe(
      await html({ ...base, lang: "en", customer_name: "  " })
    );
  });

  test("renders support URL and contact independently without a dangling conjunction", async () => {
    const site = await html({
      ...base,
      brand_support_url: "https://example.com/support",
    });
    expect(site).toContain('href="https://example.com/support"');
    expect(site).not.toContain("mailto:");
    expect(site).not.toContain(" or ");
    const contact = await html({
      ...base,
      brand_support_contact: "help@example.com",
    });
    expect(contact).toContain('href="mailto:help@example.com"');
    expect(contact).not.toContain("Visit our");
    expect(contact).not.toContain(" or ");
    const textContact = await html({
      ...base,
      brand_support_contact: "+1 555 0100",
    });
    expect(textContact).toContain("+1 555 0100");
    expect(textContact).not.toContain("mailto:");
  });

  test("escapes caller text and quoted link attributes", async () => {
    const result = await html({
      ...base,
      brand_name: '<script>alert("brand")</script>',
      customer_name: "<b>Alex & Co</b>",
      brand_support_contact: "<b>help</b>",
      brand_support_url: 'https://example.com/support?name="Alex"&lang=en',
    });
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("<b>");
    expect(result).toContain("&lt;b&gt;Alex &amp; Co&lt;/b&gt;");
    expect(result).toContain("&lt;b&gt;help&lt;/b&gt;");
    expect(result).toContain("name=&quot;Alex&quot;&amp;lang=en");
  });
});
