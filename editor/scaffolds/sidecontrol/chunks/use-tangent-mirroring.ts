import { useCurrentEditor } from "@/grida-canvas-react/use-editor";
import vn from "@grida/vn";
import cmath from "@grida/cmath";
import { useCallback, useMemo } from "react";

export default function useTangentMirroring(
  node_id: string,
  vectorNetwork: vn.VectorNetwork,
  selected_tangents: [number, 0 | 1][],
  selected_vertices: number[]
) {
  const instance = useCurrentEditor();

  const { segments } = vectorNetwork;

  const value = useMemo(() => {
    if (selected_tangents.length === 1) {
      const [v_idx] = selected_tangents[0];
      const segs = segments.filter((s) => s.a === v_idx || s.b === v_idx);
      if (segs.length === 2) {
        const ta = segs[0].a === v_idx ? segs[0].ta : segs[0].tb;
        const tb = segs[1].a === v_idx ? segs[1].ta : segs[1].tb;
        return vn.inferMirroringMode(ta, tb);
      }
    } else if (selected_vertices.length === 1) {
      const v_idx = selected_vertices[0];
      const segs = segments.filter((s) => s.a === v_idx || s.b === v_idx);
      if (segs.length >= 2) {
        const ta = segs[0].a === v_idx ? segs[0].ta : segs[0].tb;
        const tb = segs[1].a === v_idx ? segs[1].ta : segs[1].tb;
        return vn.inferMirroringMode(ta, tb);
      }
    }
    return "none" as vn.StrictTangentMirroringMode;
  }, [selected_tangents, selected_vertices, segments]);

  const setValue = useCallback(
    (mode: vn.StrictTangentMirroringMode) => {
      if (mode === "none") {
        instance.surface.surfaceConfigureCurveTangentMirroringModifier("none");
      } else {
        const verts = new Set<number>();
        for (const [v] of selected_tangents) verts.add(v);
        for (const v of selected_vertices) verts.add(v);
        verts.forEach((v) => {
          const segs = segments.filter((s) => s.a === v || s.b === v);
          if (segs.length >= 2) {
            const tA = segs[0].a === v ? segs[0].ta : segs[0].tb;
            const tB = segs[1].a === v ? segs[1].ta : segs[1].tb;
            if (cmath.vector2.isZero(tA) && cmath.vector2.isZero(tB)) {
              instance.commands.bendOrClearCorner(node_id, v);
            }
          }
        });
        instance.surface.surfaceConfigureCurveTangentMirroringModifier(mode);
      }
    },
    [instance, selected_tangents, selected_vertices, segments]
  );

  return {
    value,
    setValue,
    disabled: selected_tangents.length === 0 && selected_vertices.length === 0,
  } as const;
}
