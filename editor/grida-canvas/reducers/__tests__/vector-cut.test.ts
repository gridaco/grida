import documentReducer from "../document.reducer";

jest.mock("@grida/vn", () => {
  class VectorNetworkEditor {
    private _net: any;
    constructor(net: any) {
      this._net = JSON.parse(JSON.stringify(net));
    }
    copy({ vertices = [], segments = [] }: any) {
      const vertexSet = new Set<number>(vertices);
      const resultVertices: any[] = [];
      const indexMap = new Map<number, number>();
      Array.from(vertexSet)
        .sort((a, b) => a - b)
        .forEach((vi) => {
          indexMap.set(vi, resultVertices.length);
          resultVertices.push([...this._net.vertices[vi]]);
        });
      const resultSegments = (segments ?? []).map((si: number) => {
        const seg = this._net.segments[si];
        return {
          a: indexMap.get(seg.a)!,
          b: indexMap.get(seg.b)!,
          ta: [...seg.ta],
          tb: [...seg.tb],
        };
      });
      return { vertices: resultVertices, segments: resultSegments };
    }
    findSegments(v: number, point: "a" | "b" | "any" = "any") {
      const res: number[] = [];
      for (let i = 0; i < this._net.segments.length; i++) {
        const seg = this._net.segments[i];
        if (
          (point === "a" && seg.a === v) ||
          (point === "b" && seg.b === v) ||
          (point === "any" && (seg.a === v || seg.b === v))
        ) {
          res.push(i);
        }
      }
      return res;
    }
    deleteTangent(si: number, control: "ta" | "tb") {
      this._net.segments[si][control] = [0, 0];
    }
    deleteSegment(i: number) {
      this._net.segments.splice(i, 1);
    }
    deleteVertex(i: number) {
      this._net.vertices.splice(i, 1);
      this._net.segments = this._net.segments
        .filter((seg: any) => seg.a !== i && seg.b !== i)
        .map((seg: any) => ({
          a: seg.a > i ? seg.a - 1 : seg.a,
          b: seg.b > i ? seg.b - 1 : seg.b,
          ta: seg.ta,
          tb: seg.tb,
        }));
    }
    getBBox() {
      const verts = this._net.vertices;
      if (!verts.length) return { x: 0, y: 0, width: 0, height: 0 };
      let minX = verts[0][0],
        maxX = verts[0][0],
        minY = verts[0][1],
        maxY = verts[0][1];
      for (const [x, y] of verts.slice(1)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    translate([dx, dy]: [number, number]) {
      this._net.vertices = this._net.vertices.map(([x, y]: any) => [
        x + dx,
        y + dy,
      ]);
    }
    get value() {
      return this._net;
    }
  }
  return {
    __esModule: true,
    default: { VectorNetworkEditor },
    VectorNetworkEditor,
  };
});

jest.mock("../surface.reducer", () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe("document reducer - vector cut", () => {
  test("cuts selected vector network", () => {
    const node_id = "vector1";
    const vectorNode = {
      id: node_id,
      type: "vector",
      left: 0,
      top: 0,
      width: 10,
      height: 0,
      vectorNetwork: {
        vertices: [
          [0, 0],
          [10, 0],
        ],
        segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
      },
    } as any;

    const doc = {
      nodes: { [node_id]: vectorNode },
      scenes: {
        scene: {
          id: "scene",
          name: "Scene",
          constraints: { children: "many" },
          children: [node_id],
        },
      },
      entry_scene_id: "scene",
    } as any;

    const state = {
      editable: true,
      document: doc,
      document_ctx: {},
      scene_id: "scene",
      selection: [node_id],
      hovered_node_id: null,
      gesture: { type: "idle" },
      tool: { type: "cursor" },
      content_edit_mode: {
        type: "vector",
        node_id,
        selection: {
          selected_vertices: [0, 1],
          selected_segments: [0],
          selected_tangents: [],
        },
      },
    } as any;

    const next = documentReducer(
      state,
      { type: "cut", target: "selection" } as any,
      {} as any
    );

    const mode = next.content_edit_mode as any;
    expect(mode.clipboard).toEqual({
      vertices: [
        [0, 0],
        [10, 0],
      ],
      segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
    });
    expect(next.document.nodes[node_id].vectorNetwork).toEqual({
      vertices: [],
      segments: [],
    });
    expect(mode.selection).toEqual({
      selected_vertices: [],
      selected_segments: [],
      selected_tangents: [],
    });
  });
});
