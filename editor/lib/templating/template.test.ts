// Smoke test for `import { create } from "handlebars"`. The previous
// next.config aliased handlebars to its prebuilt UMD as a webpack workaround
// for the `require.extensions` warning. Under Turbopack that workaround is
// unnecessary — this test guards the bare-import path at runtime.
import { describe, it, expect } from "vitest";
import { render } from "./template";
import type { TemplateVariables } from ".";

describe("templating/render", () => {
  it("renders a basic interpolation", () => {
    const ctx = { name: "world" } as unknown as TemplateVariables.Context;
    expect(render("Hello {{name}}", ctx)).toBe("Hello world");
  });

  it("registers and invokes the uuid helper", () => {
    const ctx = {} as unknown as TemplateVariables.Context;
    expect(render("id={{uuid}}", ctx)).toMatch(
      /^id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});
