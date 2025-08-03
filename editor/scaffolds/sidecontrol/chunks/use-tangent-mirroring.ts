import { useCurrentEditor, useEditorState } from "@/grida-canvas-react/use-editor";
import vn from "@grida/vn";
import { useCallback, useMemo } from "react";

export default function useTangentMirroring(
  node_id: string,
  selected_tangents: [number, 0 | 1][],
  segments: vn.VectorNetworkSegment[],
  selected_vertices: number[]
) {
  const instance = useCurrentEditor();
  const { curve_tangent_mirroring } = useEditorState(instance, (s) => ({
    curve_tangent_mirroring: s.gesture_modifiers.curve_tangent_mirroring,
  }));

  const inferred = useMemo(() => {
    if (selected_tangents.length === 1) {
      const [v_idx, t_idx] = selected_tangents[0];
      const seg = segments.find((s) =>
        t_idx === 0 ? s.a === v_idx : s.b === v_idx
      );
      if (seg) {
        return vn.inferMirroringMode(seg.ta, seg.tb);
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

  const value: vn.StrictTangentMirroringMode =
    curve_tangent_mirroring === "auto"
      ? inferred
      : curve_tangent_mirroring;

  const setValue = useCallback(
    (mode: vn.StrictTangentMirroringMode) => {
      if (mode === "none") {
        instance.configureCurveTangentMirroringModifier("none");
      } else {
        const verts = new Set<number>();
        for (const [v] of selected_tangents) verts.add(v);
        for (const v of selected_vertices) verts.add(v);
        verts.forEach((v) => instance.bendCorner(node_id, v));
        instance.configureCurveTangentMirroringModifier(mode);
      }
    },
    [instance, node_id, selected_tangents, selected_vertices]
  );

  return {
    value,
    setValue,
    disabled: selected_tangents.length === 0 && selected_vertices.length === 0,
  } as const;
}
