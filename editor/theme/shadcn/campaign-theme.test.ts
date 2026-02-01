import { describe, expect, it } from "vitest";
import { resolveCampaignShadcnTheme } from "./campaign-theme";

describe("theme/shadcn/campaign-theme radius sanitization", () => {
  it("accepts valid CSS lengths", () => {
    const theme = resolveCampaignShadcnTheme({
      palette: "blue",
      radius: "12px",
    });
    expect(theme?.light["--radius"]).toBe("12px");
  });

  it("normalizes invalid radius to safe default", () => {
    const theme = resolveCampaignShadcnTheme({
      palette: "blue",
      radius: "0; } body{background:red}/*",
    });
    expect(theme?.light["--radius"]).toBe("0");
  });

  it("allows literal 0", () => {
    const theme = resolveCampaignShadcnTheme({ palette: "blue", radius: "0" });
    expect(theme?.light["--radius"]).toBe("0");
  });
});
