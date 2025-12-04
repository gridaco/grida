import { readFileSync } from "fs";
import {
  readFigFile,
  getBlobBytes,
  parseCommandsBlob,
  parseVectorNetworkBlob,
} from "../index";

describe("blob parser", () => {
  test("parses vector.fig and extracts vector network blob", () => {
    const figData = readFileSync(
      __dirname + "/../../../../fixtures/test-fig/L0/vector.fig"
    );
    const parsed = readFigFile(figData);

    // Verify we have blobs in the message
    expect(parsed.message.blobs).toBeDefined();
    expect(parsed.message.blobs!.length).toBeGreaterThan(0);

    // Find vector node
    const vectorNode = parsed.message.nodeChanges?.find(
      (nc) => nc.type === "VECTOR"
    );
    expect(vectorNode).toBeDefined();
    expect(vectorNode!.vectorData?.vectorNetworkBlob).toBeDefined();

    // Get blob data
    const blobId = vectorNode!.vectorData!.vectorNetworkBlob!;
    const blobBytes = getBlobBytes(blobId, parsed.message);
    expect(blobBytes).not.toBeNull();
    expect(blobBytes!.length).toBeGreaterThan(0);

    // Parse vector network
    const vectorNetwork = parseVectorNetworkBlob(blobBytes!);
    expect(vectorNetwork).not.toBeNull();
    
    // Verify structure
    expect(vectorNetwork!.vertices).toBeDefined();
    expect(vectorNetwork!.segments).toBeDefined();
    expect(vectorNetwork!.regions).toBeDefined();
    
    // Should have at least some data
    expect(vectorNetwork!.vertices.length).toBeGreaterThan(0);
    
    // Log the parsed data for inspection
    console.log("Vector network parsed:");
    console.log(`  Vertices: ${vectorNetwork!.vertices.length}`);
    console.log(`  Segments: ${vectorNetwork!.segments.length}`);
    console.log(`  Regions: ${vectorNetwork!.regions.length}`);
  });

  test("parses commands blob from path geometry", () => {
    const figData = readFileSync(
      __dirname + "/../../../../fixtures/test-fig/L0/vector.fig"
    );
    const parsed = readFigFile(figData);

    // Find a node with fillGeometry or strokeGeometry containing commandsBlob
    let commandsBlobId: number | undefined;
    for (const nc of parsed.message.nodeChanges || []) {
      if (nc.fillGeometry) {
        for (const path of nc.fillGeometry) {
          if (path.commandsBlob !== undefined) {
            commandsBlobId = path.commandsBlob;
            break;
          }
        }
      }
      if (!commandsBlobId && nc.strokeGeometry) {
        for (const path of nc.strokeGeometry) {
          if (path.commandsBlob !== undefined) {
            commandsBlobId = path.commandsBlob;
            break;
          }
        }
      }
      if (commandsBlobId !== undefined) break;
    }

    if (commandsBlobId === undefined) {
      // Skip if no commands blob found
      console.log("No commands blob found in vector.fig");
      return;
    }

    // Get blob data
    const blobBytes = getBlobBytes(commandsBlobId, parsed.message);
    expect(blobBytes).not.toBeNull();

    // Parse commands
    const commands = parseCommandsBlob(blobBytes!);
    expect(commands).not.toBeNull();
    expect(Array.isArray(commands)).toBe(true);
    
    // Should have at least some commands
    expect(commands!.length).toBeGreaterThan(0);
    
    // First command should be a string (M, L, etc.)
    expect(typeof commands![0]).toBe("string");
    
    console.log("Commands parsed:");
    console.log(`  Total elements: ${commands!.length}`);
    console.log(`  First few:`, commands!.slice(0, 10));
  });

  test("getBlobBytes handles invalid blob IDs", () => {
    const figData = readFileSync(
      __dirname + "/../../../../fixtures/test-fig/L0/blank.fig"
    );
    const parsed = readFigFile(figData);

    // Try to get non-existent blob
    const result = getBlobBytes(99999, parsed.message);
    expect(result).toBeNull();
  });

  test("parseCommandsBlob handles invalid data", () => {
    // Empty buffer
    expect(parseCommandsBlob(new Uint8Array())).toEqual([]);

    // Invalid command type
    const invalidCmd = new Uint8Array([99]);
    expect(parseCommandsBlob(invalidCmd)).toBeNull();

    // Incomplete data (M command with only partial coordinates)
    const incompleteM = new Uint8Array([1, 0, 0]); // M but missing bytes
    expect(parseCommandsBlob(incompleteM)).toBeNull();
  });

  test("parseVectorNetworkBlob handles invalid data", () => {
    // Too small buffer
    expect(parseVectorNetworkBlob(new Uint8Array(4))).toBeNull();

    // Incomplete vertex data
    const bytes = new Uint8Array(12 + 4); // Header + partial vertex
    new DataView(bytes.buffer).setUint32(0, 1, true); // 1 vertex
    expect(parseVectorNetworkBlob(bytes)).toBeNull();
  });
});

