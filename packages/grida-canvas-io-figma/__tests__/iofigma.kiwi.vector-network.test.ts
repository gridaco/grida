import { readFileSync } from "fs";
import { describe, it } from "vitest";
import { readFigFile, getBlobBytes, parseVectorNetworkBlob } from "../fig-kiwi";
import { iofigma } from "../lib";

function bbox(vertices: Array<{ x: number; y: number }>) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

describe("iofigma.kiwi vectorNetworkBlob mapping", () => {
  it("scales blob coordinates from normalizedSize space into node size space (.fig fixture)", () => {
    // Use a git-included .fig fixture to keep this regression test stable and shippable.
    const data = readFileSync(
      __dirname +
        "/../../../fixtures/test-fig/community/1510053249065427020-workos-radix-icons.fig"
    );
    const figData = readFigFile(data);
    const nodeChanges = figData.message.nodeChanges ?? [];

    // Pick a representative VECTOR where normalizedSize != size and bbox starts near 0,0.
    const candidate = nodeChanges.find((nc: any) => {
      if (nc.type !== "VECTOR") return false;
      if (nc.vectorData?.vectorNetworkBlob === undefined) return false;
      if (!nc.size || !nc.vectorData?.normalizedSize) return false;
      const nsz = nc.vectorData.normalizedSize;
      const sz = nc.size;
      if (!nsz.x || !nsz.y) return false;
      const sx = sz.x / nsz.x;
      const sy = sz.y / nsz.y;
      // Require non-trivial scaling
      if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) return false;

      const blobBytes = getBlobBytes(
        nc.vectorData.vectorNetworkBlob,
        figData.message
      );
      const raw = blobBytes ? parseVectorNetworkBlob(blobBytes) : null;
      if (!raw) return false;
      const bb = bbox(raw.vertices);
      if (!bb) return false;
      // Prefer ones anchored at origin to make the assertion crisp.
      return Math.abs(bb.minX) < 1e-3 && Math.abs(bb.minY) < 1e-3;
    });

    // NOTE: this is a test-only guard. We keep it explicit to satisfy strict typecheck.
    if (!candidate) {
      throw new Error("No suitable VECTOR candidate found in the .fig fixture");
    }
    // Cast to any to avoid over-specifying the full Kiwi NodeChange type here.
    const nc: any = candidate;
    if (!nc.vectorData || nc.vectorData.vectorNetworkBlob === undefined) {
      throw new Error("Candidate is missing vectorData.vectorNetworkBlob");
    }
    if (!nc.vectorData.normalizedSize || !nc.size) {
      throw new Error("Candidate is missing normalizedSize or size");
    }

    const blobBytes = getBlobBytes(
      nc.vectorData.vectorNetworkBlob,
      figData.message
    )!;
    const raw = parseVectorNetworkBlob(blobBytes)!;
    const rawB = bbox(raw.vertices)!;

    const restNode = iofigma.kiwi.factory.node(nc, figData.message) as any;
    expect(restNode.type).toBe("X_VECTOR");
    const mappedB = bbox(restNode.vectorNetwork.vertices)!;

    const nsz = nc.vectorData.normalizedSize;
    const sz = nc.size;
    const sx = sz.x / nsz.x;
    const sy = sz.y / nsz.y;

    const expectedWidth = rawB.width * sx;
    const expectedHeight = rawB.height * sy;

    expect(mappedB.width).toBeCloseTo(expectedWidth, 3);
    expect(mappedB.height).toBeCloseTo(expectedHeight, 3);
    expect(mappedB.minX).toBeCloseTo(rawB.minX * sx, 3);
    expect(mappedB.minY).toBeCloseTo(rawB.minY * sy, 3);
  });
});
