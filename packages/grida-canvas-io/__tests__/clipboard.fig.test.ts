import { readFileSync } from "fs";
import { io } from "../index";

/**
 * Tests for Figma clipboard detection and priority
 *
 * This test verifies Figma clipboard format detection without parsing.
 * The actual parsing and conversion (HTML → Kiwi → Figma IR → Grida)
 * is tested in @grida/io-figma and the editor layer.
 */
describe("figma clipboard", () => {
  describe("detection", () => {
    it("should detect ellipse clipboard format", () => {
      const html = readFileSync(
        __dirname +
          "/../../../fixtures/test-fig/clipboard/ellipse-circle-100x100-black.clipboard.html",
        { encoding: "utf-8" }
      );

      const result = io.clipboard.isFigmaClipboard(html);
      expect(result).toBe(true);
    });

    it("should detect rectangle clipboard format", () => {
      const html = readFileSync(
        __dirname +
          "/../../../fixtures/test-fig/clipboard/rect-square-100x100-black.clipboard.html",
        { encoding: "utf-8" }
      );

      const result = io.clipboard.isFigmaClipboard(html);
      expect(result).toBe(true);
    });

    it("should detect star clipboard format", () => {
      const html = readFileSync(
        __dirname +
          "/../../../fixtures/test-fig/clipboard/star-5-40-100x100-black.clipboard.html",
        { encoding: "utf-8" }
      );

      const result = io.clipboard.isFigmaClipboard(html);
      expect(result).toBe(true);
    });

    it("should detect multiple Figma clipboard formats", () => {
      const fixtures = [
        "ellipse-circle-100x100-black.clipboard.html",
        "rect-square-100x100-black.clipboard.html",
        "star-5-40-100x100-black.clipboard.html",
      ];

      fixtures.forEach((fixture) => {
        const html = readFileSync(
          __dirname + `/../../../fixtures/test-fig/clipboard/${fixture}`,
          { encoding: "utf-8" }
        );

        const result = io.clipboard.isFigmaClipboard(html);
        expect(result).toBe(true);
      });
    });

    it("should detect Figma clipboard format with Chrome Clipboard API escaped entities", () => {
      const fixtures = [
        "ellipse-circle-100x100-black.clipboard.html",
        "rect-square-100x100-black.clipboard.html",
        "star-5-40-100x100-black.clipboard.html",
      ];

      fixtures.forEach((fixture) => {
        const originalHtml = readFileSync(
          __dirname + `/../../../fixtures/test-fig/clipboard/${fixture}`,
          { encoding: "utf-8" }
        );

        // Mock Chrome Clipboard API behavior (escapes HTML entities)
        const chromeMockedHtml =
          io.clipboard.testing.__testonly_mock_chrome_escape_attributes(
            originalHtml
          );

        // Should still detect Figma clipboard even with escaped entities
        const result = io.clipboard.isFigmaClipboard(chromeMockedHtml);
        expect(result).toBe(true);
      });
    });

    it("should return false for non-Figma HTML", () => {
      const html = "<div>Just some HTML</div>";
      const result = io.clipboard.isFigmaClipboard(html);
      expect(result).toBe(false);
    });

    it("should return false for Grida clipboard HTML", () => {
      const gridaPayload: io.clipboard.ClipboardPayload = {
        type: "prototypes",
        ids: ["test-id"],
        payload_id: "test-payload-id",
        prototypes: [],
      };

      const html = io.clipboard.encodeClipboardHtml(gridaPayload);
      const result = io.clipboard.isFigmaClipboard(html);
      expect(result).toBe(false);
    });
  });

  describe("priority", () => {
    it("should prioritize Grida clipboard over Figma", () => {
      // This test verifies that if both Grida and Figma markers exist,
      // Grida clipboard takes precedence (as per design)

      const gridaPayload: io.clipboard.ClipboardPayload = {
        type: "prototypes",
        ids: ["test-id"],
        payload_id: "test-payload-id",
        prototypes: [],
      };

      const gridaHtml = io.clipboard.encodeClipboardHtml(gridaPayload);

      // Grida HTML should decode as Grida, not Figma
      const decoded = io.clipboard.decodeClipboardHtml(gridaHtml);
      expect(decoded).toEqual(gridaPayload);

      // Figma detection should return false for Grida HTML
      const figmaResult = io.clipboard.isFigmaClipboard(gridaHtml);
      expect(figmaResult).toBe(false);
    });
  });
});
