import { sanitize_email_display_name } from "./sanitize";

describe("sanitize_email_display_name", () => {
  it("passes through a clean name unchanged", () => {
    expect(sanitize_email_display_name("Acme Corp")).toBe("Acme Corp");
  });

  it("strips double quotes", () => {
    expect(sanitize_email_display_name('"Acme" Corp')).toBe("Acme Corp");
  });

  it("strips angle brackets", () => {
    expect(sanitize_email_display_name("Acme <evil>")).toBe("Acme evil");
  });

  it("strips backslashes", () => {
    expect(sanitize_email_display_name("Acme\\Corp")).toBe("AcmeCorp");
  });

  it("strips control characters", () => {
    expect(sanitize_email_display_name("Acme\x00\x0d\x0aCorp")).toBe(
      "AcmeCorp"
    );
  });

  it("collapses whitespace", () => {
    expect(sanitize_email_display_name("Acme   Corp")).toBe("Acme Corp");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitize_email_display_name("  Acme Corp  ")).toBe("Acme Corp");
  });

  it("handles a combination of unsafe characters", () => {
    expect(sanitize_email_display_name('  "My" <Brand>  \\ \n Name  ')).toBe(
      "My Brand Name"
    );
  });

  it("returns empty string for all-unsafe input", () => {
    expect(sanitize_email_display_name('"<>\\\x00')).toBe("");
  });
});
