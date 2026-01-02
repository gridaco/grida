import { describe, it, expect } from "vitest";
import * as flatbuffers from "flatbuffers";
import * as fbs from "..";

describe("@grida/format", () => {
  it("should export generated types", () => {
    // Verify that key types are exported
    expect(fbs.GridaFile).toBeDefined();
    expect(fbs.CanvasDocument).toBeDefined();
    expect(fbs.Node).toBeDefined();
    expect(fbs.NodeType).toBeDefined();
  });

  it("should be able to create a minimal FlatBuffers document", () => {
    const builder = new flatbuffers.Builder(1024);

    // Build schema version string
    const schemaVersion = builder.createString("0.89.0-beta+20251219");

    // Build empty arrays for nodes, links, scenes
    const nodesOffset = fbs.CanvasDocument.createNodesVector(builder, []);

    // Build empty scenes vector (vector of NodeIdentifier tables)
    const scenesOffset = fbs.CanvasDocument.createScenesVector(builder, []);

    // Build Document table
    fbs.CanvasDocument.startCanvasDocument(builder);
    fbs.CanvasDocument.addSchemaVersion(builder, schemaVersion);
    fbs.CanvasDocument.addNodes(builder, nodesOffset);
    fbs.CanvasDocument.addScenes(builder, scenesOffset);
    const documentOffset = fbs.CanvasDocument.endCanvasDocument(builder);

    // Build GridaFile root
    fbs.GridaFile.startGridaFile(builder);
    fbs.GridaFile.addDocument(builder, documentOffset);
    const rootOffset = fbs.GridaFile.endGridaFile(builder);

    builder.finish(rootOffset);

    // Verify we can read it back
    const bytes = builder.asUint8Array();
    expect(bytes.length).toBeGreaterThan(0);

    const buf = new flatbuffers.ByteBuffer(bytes);
    const gridaFile = fbs.GridaFile.getRootAsGridaFile(buf);
    const document = gridaFile.document();

    expect(document).toBeDefined();
    expect(document?.schemaVersion()).toBe("0.89.0-beta+20251219");
    expect(document?.nodesLength()).toBe(0);
    expect(document?.scenesLength()).toBe(0);
  });
});
