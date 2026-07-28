/** Onboarding completion has one native navigation authority. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const flowSource = readFileSync(
  new URL(
    "../../../scaffolds/desktop/onboarding/first-run-onboarding.tsx",
    import.meta.url
  ),
  "utf8"
);

describe("Desktop onboarding navigation authority", () => {
  it("completes through native IPC without a renderer routing fallback", () => {
    expect(source).toContain("complete_onboarding");
    expect(source).not.toContain('from "next/navigation"');
    expect(source).not.toMatch(/\brouter\.(?:push|replace)\b/);
    expect(source).not.toContain("onboarding_flag");
    expect(source).not.toContain("localStorage");
  });

  it("keeps native completion failures visible and retryable", () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain("Try again");
    expect(source).toContain("finish(completionFailure.workspace)");
    expect(source).toContain("setCompletionFailure({ workspace })");
  });

  it("allows every non-ready ChatGPT state to skip", () => {
    expect(flowSource).toContain("{!ready ? (");
    expect(flowSource).not.toContain("{!connected ? (");
  });
});
