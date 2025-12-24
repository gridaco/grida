import { readFileSync } from "fs";
import { readHTMLMessage } from "../fig-kiwi";
import { iofigma } from "../lib";

const FIXTURES_BASE = __dirname + "/../../../fixtures/test-fig/clipboard";

const COMPONENT_BLUE = FIXTURES_BASE + "/component-component-blue.clipboard.html";
const COMPONENT_RED = FIXTURES_BASE + "/component-component-red.clipboard.html";
const INSTANCE_BLUE =
  FIXTURES_BASE + "/component-component-instance-blue.clipboard.html";
const INSTANCE_RED =
  FIXTURES_BASE + "/component-component-instance-red.clipboard.html";

describe("iofigma.kiwi.buildClipboardRootNodes (components/instances)", () => {
  it("component definition copy: returns the COMPONENT root (blue)", () => {
    const html = readFileSync(COMPONENT_BLUE, "utf-8");
    const parsed = readHTMLMessage(html);

    const roots = iofigma.kiwi.buildClipboardRootNodes({
      nodeChanges: parsed.message.nodeChanges || [],
      message: parsed.message,
      options: { flattenInstances: true },
    });

    expect(roots.length).toBe(1);
    expect(roots[0].type).toBe("COMPONENT");
  });

  it("component definition copy: returns the COMPONENT root (red)", () => {
    const html = readFileSync(COMPONENT_RED, "utf-8");
    const parsed = readHTMLMessage(html);

    const roots = iofigma.kiwi.buildClipboardRootNodes({
      nodeChanges: parsed.message.nodeChanges || [],
      message: parsed.message,
      options: { flattenInstances: true },
    });

    expect(roots.length).toBe(1);
    expect(roots[0].type).toBe("COMPONENT");
  });

  it("instance copy: returns the INSTANCE root and excludes internal SYMBOL master (blue)", () => {
    const html = readFileSync(INSTANCE_BLUE, "utf-8");
    const parsed = readHTMLMessage(html);

    const roots = iofigma.kiwi.buildClipboardRootNodes({
      nodeChanges: parsed.message.nodeChanges || [],
      message: parsed.message,
      options: { flattenInstances: true },
    });

    expect(roots.length).toBe(1);
    expect(roots[0].type).toBe("INSTANCE");
    // In the observed clipboard structure, the component definition SYMBOL lives in an internal-only canvas.
    // It should not be returned as an insertable root.
    expect(roots.some((n) => n.type === "COMPONENT")).toBe(false);
  });

  it("instance copy: returns the INSTANCE root and excludes internal SYMBOL master (red)", () => {
    const html = readFileSync(INSTANCE_RED, "utf-8");
    const parsed = readHTMLMessage(html);

    const roots = iofigma.kiwi.buildClipboardRootNodes({
      nodeChanges: parsed.message.nodeChanges || [],
      message: parsed.message,
      options: { flattenInstances: true },
    });

    expect(roots.length).toBe(1);
    expect(roots[0].type).toBe("INSTANCE");
    expect(roots.some((n) => n.type === "COMPONENT")).toBe(false);
  });
});


