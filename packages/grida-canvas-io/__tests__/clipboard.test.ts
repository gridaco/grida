import { io } from "../index";
import type grida from "@grida/schema";

describe("clipboard", () => {
  // Using a simple test payload instead of the full ClipboardPayload type
  // This is just for testing the IO functionality
  const testPayload: io.clipboard.ClipboardPayload = {
    type: "prototypes",
    ids: ["<id>"],
    payload_id: "52b698ef-d06a-4f9c-ac4c-c26e744c8567",
    prototypes: [
      {
        active: true,
        fill: {
          color: {
            a: 1,
            b: 0,
            g: 0,
            r: 0,
          },
          type: "solid",
        },
        font_family: "Inter",
        font_size: 14,
        font_weight: 400,
        height: "auto",
        locked: false,
        name: "tspan",
        opacity: 1,
        position: "absolute",
        text: "Text",
        type: "tspan",
        width: "auto",
        z_index: 0,
      },
    ],
  } satisfies io.clipboard.ClipboardPayload;

  it("should encode and decode clipboard data correctly", () => {
    // Encode the test payload to HTML
    const encoded = io.clipboard.encodeClipboardHtml(testPayload);

    // Verify the encoded string contains the expected structure
    expect(encoded).toContain("data-grida-io-clipboard");
    expect(encoded).toContain("b64:");

    // Decode the HTML back to the original payload
    const decoded = io.clipboard.decodeClipboardHtml(encoded);

    // Verify the decoded data matches the original
    expect(decoded).toEqual(testPayload);
  });

  it("should decode clipboard data even if the html is manipulated by the browser", () => {
    // browser will append meta, html, head, body tags
    const html = `<meta charset='utf-8'><html><head></head><body>${io.clipboard.encodeClipboardHtml(
      testPayload
    )}</body></html>`;
    const decoded = io.clipboard.decodeClipboardHtml(html);
    expect(decoded).toEqual(testPayload);
  });

  it("should return null for invalid clipboard data", () => {
    // Test with invalid HTML
    expect(io.clipboard.decodeClipboardHtml("<div>invalid</div>")).toBeNull();

    // Test with missing data attribute
    expect(io.clipboard.decodeClipboardHtml("<span></span>")).toBeNull();

    // Test with invalid base64 data
    expect(
      io.clipboard.decodeClipboardHtml(
        '<span data-grida-io-clipboard="b64:invalid"></span>'
      )
    ).toBeNull();
  });

  it("does not encode non-prototype payloads to transferable clipboard items", () => {
    const payload: io.clipboard.ClipboardPayload = {
      payload_id: "payload-2",
      type: "property/fill-image-paint",
      paint: {
        type: "image",
        opacity: 1,
        visible: true,
        transform: [1, 0, 0, 1, 0, 0],
        scaleMode: "fill",
        imageRef: { type: "project_asset", id: "asset" },
      },
      paint_target: "fill",
      paint_index: 0,
      node_id: "node",
    };

    expect(io.clipboard.encode(payload)).toBeNull();
    expect(io.clipboard.encodeClipboardText(payload)).toBeNull();
  });

  it("should encode large clipboard payloads without stack overflow", () => {
    // Create a large payload that would cause stack overflow with spread operator
    // Simulate copying a root container with many nested children
    const largePrototype: grida.program.nodes.NodePrototype = {
      type: "container",
      name: "Root",
      active: true,
      locked: false,
      position: "absolute",
      width: 1000,
      height: 1000,
      children: Array.from({ length: 100 }, (_, i) => ({
        type: "container" as const,
        name: `Child ${i}`,
        active: true,
        locked: false,
        position: "absolute" as const,
        width: 100,
        height: 100,
        children: Array.from({ length: 50 }, (_, j) => ({
          type: "tspan" as const,
          name: `Text ${i}-${j}`,
          active: true,
          locked: false,
          position: "absolute" as const,
          text: `This is text node ${i}-${j} with some content to make it larger`,
          font_family: "Inter",
          font_size: 14,
          font_weight: 400,
          width: "auto" as const,
          height: "auto" as const,
          fill: {
            type: "solid" as const,
            color: { r: 0, g: 0, b: 0, a: 1 },
            active: true,
          },
          opacity: 1,
          z_index: 0,
        })),
      })),
    };

    const largePayload: io.clipboard.ClipboardPayload = {
      type: "prototypes",
      ids: ["root"],
      payload_id: "large-payload-test",
      prototypes: [largePrototype],
    };

    // This should not throw a stack overflow error
    expect(() => {
      const encoded = io.clipboard.encodeClipboardHtml(largePayload);
      expect(encoded).toContain("data-grida-io-clipboard");
      expect(encoded).toContain("b64:");

      // Verify it can be decoded back
      const decoded = io.clipboard.decodeClipboardHtml(encoded);
      expect(decoded).toBeTruthy();
      expect(decoded?.payload_id).toBe("large-payload-test");
    }).not.toThrow();
  });

  describe("isSvgText", () => {
    it("should detect valid SVG with namespace", () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" /></svg>';
      expect(io.clipboard.isSvgText(svg)).toBe(true);
    });

    it("should detect SVG with XML declaration", () => {
      const svg =
        '<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"><circle r="50" /></svg>';
      expect(io.clipboard.isSvgText(svg)).toBe(true);
    });

    it("should detect multiline SVG", () => {
      const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect width="100" height="100" />
</svg>`;
      expect(io.clipboard.isSvgText(svg)).toBe(true);
    });

    it("should detect SVG with multiple namespaces", () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="70" height="26">
  <rect fill="#F5F5F5" width="70" height="26"/>
</svg>`;
      expect(io.clipboard.isSvgText(svg)).toBe(true);
    });

    it("should reject non-SVG text", () => {
      expect(io.clipboard.isSvgText("Hello World")).toBe(false);
      expect(io.clipboard.isSvgText("<div>Not SVG</div>")).toBe(false);
      expect(io.clipboard.isSvgText("")).toBe(false);
    });

    it("should reject SVG without xmlns", () => {
      const svg =
        '<svg width="100" height="100"><rect width="100" height="100" /></svg>';
      expect(io.clipboard.isSvgText(svg)).toBe(false);
    });

    it("should reject incomplete SVG", () => {
      expect(
        io.clipboard.isSvgText('<svg xmlns="http://www.w3.org/2000/svg">')
      ).toBe(false);
      expect(io.clipboard.isSvgText("</svg>")).toBe(false);
    });

    it("should reject text mentioning xmlns but not valid SVG", () => {
      expect(
        io.clipboard.isSvgText(
          'This text mentions xmlns="http://www.w3.org/2000/svg" but is not SVG'
        )
      ).toBe(false);
    });
  });
});
