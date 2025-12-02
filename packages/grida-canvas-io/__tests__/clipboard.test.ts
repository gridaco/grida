import { io } from "../index";

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
        fontFamily: "Inter",
        fontSize: 14,
        fontWeight: 400,
        height: "auto",
        locked: false,
        name: "text",
        opacity: 1,
        position: "absolute",
        text: "Text",
        type: "text",
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
});
