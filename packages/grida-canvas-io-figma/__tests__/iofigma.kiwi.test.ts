import { readFileSync } from "fs";
import { readFigFile, readHTMLMessage } from "../fig-kiwi";
import { iofigma } from "../lib";
import type * as figrest from "@figma/rest-api-spec";

const FIXTURES_BASE = __dirname + "/../../../fixtures/test-fig";
const CLIPBOARD_GROUP_FIXTURE =
  FIXTURES_BASE + "/clipboard/group-with-r-g-b-rect.clipboard.html";
const CLIPBOARD_FRAME_FIXTURE =
  FIXTURES_BASE + "/clipboard/frame-with-r-g-b-rect.clipboard.html";
const FIG_FRAME_FIXTURE = FIXTURES_BASE + "/L0/frame.fig";

describe("iofigma.kiwi.factory.node", () => {
  describe("GROUP detection and conversion", () => {
    it("should convert GROUP-originated FRAME to GroupNode from clipboard", () => {
      const clipboardHTML = readFileSync(CLIPBOARD_GROUP_FIXTURE, "utf-8");

      const { message } = readHTMLMessage(clipboardHTML);
      const nodeChanges = message.nodeChanges || [];

      // Find the FRAME node that was originally a GROUP
      const groupFrame = nodeChanges.find(
        (nc) => nc.type === "FRAME" && nc.name === "group"
      );

      expect(groupFrame).toBeDefined();
      expect(groupFrame?.type).toBe("FRAME");

      // Verify it has GROUP-originated properties
      expect(groupFrame?.frameMaskDisabled).toBe(false);
      expect(groupFrame?.resizeToFit).toBe(true);
      // Verify no paints (GROUPs don't have fills or strokes)
      // Paints can be undefined or empty array
      expect(
        !groupFrame?.fillPaints || groupFrame.fillPaints.length === 0
      ).toBe(true);
      expect(
        !groupFrame?.strokePaints || groupFrame.strokePaints.length === 0
      ).toBe(true);
      expect(
        !groupFrame?.backgroundPaints ||
          groupFrame.backgroundPaints.length === 0
      ).toBe(true);

      // Convert to REST API format
      const restApiNode = iofigma.kiwi.factory.node(groupFrame!, message);

      expect(restApiNode).toBeDefined();
      expect(restApiNode?.type).toBe("GROUP");
      expect((restApiNode as figrest.GroupNode).clipsContent).toBe(false);
      expect((restApiNode as figrest.GroupNode).fills).toEqual([]);
    });

    it("should convert real FRAME to FrameNode from clipboard", () => {
      const clipboardHTML = readFileSync(CLIPBOARD_FRAME_FIXTURE, "utf-8");

      const { message } = readHTMLMessage(clipboardHTML);
      const nodeChanges = message.nodeChanges || [];

      // Find the real FRAME node
      const frameNode = nodeChanges.find(
        (nc) => nc.type === "FRAME" && nc.name === "frame"
      );

      expect(frameNode).toBeDefined();
      expect(frameNode?.type).toBe("FRAME");

      // Verify it has real FRAME properties
      // Real FRAMEs typically have frameMaskDisabled === true or undefined
      // and resizeToFit === undefined
      expect(frameNode?.resizeToFit).toBeUndefined();

      // Convert to REST API format
      const restApiNode = iofigma.kiwi.factory.node(frameNode!, message);

      expect(restApiNode).toBeDefined();
      expect(restApiNode?.type).toBe("FRAME");
      expect((restApiNode as figrest.FrameNode).clipsContent).toBe(true);
      // Real FRAMEs can have fills, but this one might not
      expect(Array.isArray((restApiNode as figrest.FrameNode).fills)).toBe(
        true
      );
    });

    it("should convert GROUP-originated FRAME to GroupNode from .fig file", () => {
      const figFileBytes = readFileSync(FIG_FRAME_FIXTURE);

      const figData = readFigFile(figFileBytes);
      const nodeChanges = figData.message.nodeChanges || [];

      // Find the FRAME node that was originally a GROUP (named "group")
      const groupFrame = nodeChanges.find(
        (nc) => nc.type === "FRAME" && nc.name === "group"
      );

      expect(groupFrame).toBeDefined();
      expect(groupFrame?.type).toBe("FRAME");

      // Verify it has GROUP-originated properties
      expect(groupFrame?.frameMaskDisabled).toBe(false);
      expect(groupFrame?.resizeToFit).toBe(true);
      // Verify no paints (GROUPs don't have fills or strokes)
      // Paints can be undefined or empty array
      expect(
        !groupFrame?.fillPaints || groupFrame.fillPaints.length === 0
      ).toBe(true);
      expect(
        !groupFrame?.strokePaints || groupFrame.strokePaints.length === 0
      ).toBe(true);
      expect(
        !groupFrame?.backgroundPaints ||
          groupFrame.backgroundPaints.length === 0
      ).toBe(true);

      // Convert to REST API format
      const restApiNode = iofigma.kiwi.factory.node(
        groupFrame!,
        figData.message
      );

      expect(restApiNode).toBeDefined();
      expect(restApiNode?.type).toBe("GROUP");
      expect((restApiNode as figrest.GroupNode).clipsContent).toBe(false);
      expect((restApiNode as figrest.GroupNode).fills).toEqual([]);
    });

    it("should convert real FRAME to FrameNode from .fig file", () => {
      const figFileBytes = readFileSync(FIG_FRAME_FIXTURE);

      const figData = readFigFile(figFileBytes);
      const nodeChanges = figData.message.nodeChanges || [];

      // Find the real FRAME node (named "frame")
      const frameNode = nodeChanges.find(
        (nc) => nc.type === "FRAME" && nc.name === "frame"
      );

      expect(frameNode).toBeDefined();
      expect(frameNode?.type).toBe("FRAME");

      // Verify it has real FRAME properties
      expect(frameNode?.frameMaskDisabled).toBe(true);
      expect(frameNode?.resizeToFit).toBeUndefined();

      // Convert to REST API format
      const restApiNode = iofigma.kiwi.factory.node(
        frameNode!,
        figData.message
      );

      expect(restApiNode).toBeDefined();
      expect(restApiNode?.type).toBe("FRAME");
      expect((restApiNode as figrest.FrameNode).clipsContent).toBe(true);
      expect(Array.isArray((restApiNode as figrest.FrameNode).fills)).toBe(
        true
      );
    });

    it("should handle edge cases: FRAME with frameMaskDisabled=false but resizeToFit=undefined", () => {
      // Create a mock NodeChange that's a FRAME but doesn't match GROUP pattern
      const mockFrame: any = {
        type: "FRAME",
        guid: { sessionID: 1, localID: 1 },
        name: "test-frame",
        size: { x: 100, y: 100 },
        frameMaskDisabled: false, // Could be false for other reasons
        resizeToFit: undefined, // Not true, so not a GROUP
      };

      const mockMessage: any = { nodeChanges: [], blobs: [] };

      const restApiNode = iofigma.kiwi.factory.node(mockFrame, mockMessage);

      // Should still be a FRAME, not a GROUP
      expect(restApiNode).toBeDefined();
      expect(restApiNode?.type).toBe("FRAME");
    });

    it("should handle edge cases: FRAME with resizeToFit=true but frameMaskDisabled=true", () => {
      // Create a mock NodeChange that's a FRAME but doesn't match GROUP pattern
      const mockFrame: any = {
        type: "FRAME",
        guid: { sessionID: 1, localID: 1 },
        name: "test-frame",
        size: { x: 100, y: 100 },
        frameMaskDisabled: true, // Not false, so not a GROUP
        resizeToFit: true, // Could be true for other reasons
      };

      const mockMessage: any = { nodeChanges: [], blobs: [] };

      const restApiNode = iofigma.kiwi.factory.node(mockFrame, mockMessage);

      // Should still be a FRAME, not a GROUP
      expect(restApiNode).toBeDefined();
      expect(restApiNode?.type).toBe("FRAME");
    });
  });

  describe("other node type conversions", () => {
    it("should convert RECTANGLE node correctly", () => {
      const mockRect: any = {
        type: "RECTANGLE",
        guid: { sessionID: 1, localID: 1 },
        name: "test-rect",
        size: { x: 100, y: 100 },
      };

      const mockMessage: any = { nodeChanges: [], blobs: [] };

      const restApiNode = iofigma.kiwi.factory.node(mockRect, mockMessage);

      expect(restApiNode).toBeDefined();
      expect(restApiNode?.type).toBe("RECTANGLE");
    });

    it("should convert ELLIPSE node correctly", () => {
      const mockEllipse: any = {
        type: "ELLIPSE",
        guid: { sessionID: 1, localID: 1 },
        name: "test-ellipse",
        size: { x: 100, y: 100 },
      };

      const mockMessage: any = { nodeChanges: [], blobs: [] };

      const restApiNode = iofigma.kiwi.factory.node(mockEllipse, mockMessage);

      expect(restApiNode).toBeDefined();
      expect(restApiNode?.type).toBe("ELLIPSE");
    });
  });

  describe("frame clipping behavior", () => {
    it("should correctly map frameMaskDisabled to clipsContent", () => {
      const figFileBytes = readFileSync(FIG_FRAME_FIXTURE);
      const figData = readFigFile(figFileBytes);
      const nodeChanges = figData.message.nodeChanges || [];

      // Find the three FRAME nodes
      const regularFrame = nodeChanges.find(
        (nc) =>
          nc.type === "FRAME" &&
          nc.name === "frame" &&
          nc.frameMaskDisabled === true
      );
      const frameWithClip = nodeChanges.find(
        (nc) =>
          nc.type === "FRAME" &&
          nc.name === "frame" &&
          nc.frameMaskDisabled === false &&
          !nc.resizeToFit
      );
      const groupFrame = nodeChanges.find(
        (nc) => nc.type === "FRAME" && nc.name === "group"
      );

      expect(regularFrame).toBeDefined();
      expect(frameWithClip).toBeDefined();
      expect(groupFrame).toBeDefined();

      // Convert and check clipsContent
      const regularRest = iofigma.kiwi.factory.node(
        regularFrame!,
        figData.message
      );
      const frameWithClipRest = iofigma.kiwi.factory.node(
        frameWithClip!,
        figData.message
      );
      const groupRest = iofigma.kiwi.factory.node(groupFrame!, figData.message);

      expect(regularRest?.type).toBe("FRAME");
      expect(frameWithClipRest?.type).toBe("FRAME");
      expect(groupRest?.type).toBe("GROUP");

      // Regular FRAME: frameMaskDisabled=true → clipsContent=true
      expect((regularRest as any)?.clipsContent).toBe(true);

      // FRAME with clip: frameMaskDisabled=false → clipsContent=false
      expect((frameWithClipRest as any)?.clipsContent).toBe(false);

      // GROUP: handled separately, always clipsContent=false
      expect((groupRest as any)?.clipsContent).toBe(false);
    });
  });
});
