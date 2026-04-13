import cmath from "@grida/cmath";
import { measure, Measurement } from "@grida/cmath/_measurement";
import { useTransformState } from "@/grida-canvas-react/provider";
import { useEditorState, useCurrentEditor } from "@/grida-canvas-react";
import { useEffect, useState } from "react";
import { useViewport } from "../context";
import { MeasurementGuide as MeasurementGuideCanvas } from "@grida/hud/react";
import { WorkbenchColors } from "@/grida-canvas-react/ui-config";

/**
 * Pure function to calculate regular measurement.
 *
 * This function contains the core logic for calculating measurements between
 * selected nodes and hovered nodes.
 *
 * @param params - Parameters for measurement calculation
 * @returns Measurement result or null if conditions not met
 */
function calculateMeasurement(params: {
  selection: string[];
  surface_measurement_target: string[] | undefined;
  getNodeAbsoluteBoundingRect: (id: string) => cmath.Rectangle | null;
}): Measurement | null {
  const { selection, surface_measurement_target, getNodeAbsoluteBoundingRect } =
    params;

  if (!(selection.length > 0) || !surface_measurement_target) {
    return null;
  }

  const a_rect = cmath.rect.quantize(
    cmath.rect.union(
      selection.map((id) => getNodeAbsoluteBoundingRect(id)!).filter(Boolean)
    ),
    0.01
  );

  const b_rect = cmath.rect.quantize(
    cmath.rect.union(
      surface_measurement_target
        .map((id) => getNodeAbsoluteBoundingRect(id)!)
        .filter(Boolean)
    ),
    0.01
  );

  const measurement = measure(a_rect, b_rect);
  if (measurement) {
    return {
      a: a_rect,
      b: b_rect,
      distance: measurement.distance,
      box: measurement.box,
    };
  }

  return null;
}

function useMeasurement() {
  const editor = useCurrentEditor();
  const selection = useEditorState(editor, (state) => state.selection);
  const document = useEditorState(editor, (state) => state.document);
  const surface_measurement_target = useEditorState(
    editor,
    (state) => state.surface_measurement_target
  );

  const [measurement, setMeasurement] = useState<Measurement>();

  useEffect(() => {
    try {
      const result = calculateMeasurement({
        selection,
        surface_measurement_target,
        getNodeAbsoluteBoundingRect: (id: string) =>
          editor.geometryProvider.getNodeAbsoluteBoundingRect(id),
      });

      setMeasurement(result || undefined);
    } catch (e) {
      console.error("useMeasurement", e);
      setMeasurement(undefined);
    }
  }, [
    document,
    selection,
    surface_measurement_target,
    editor.geometryProvider,
  ]);

  return measurement;
}

/**
 * Measurement guide rendered on a HUD canvas overlay.
 *
 * Replaces the previous DOM-based `MeasurementGuideRenderer` with an
 * imperative Canvas 2D renderer via `@grida/hud`.
 */
export function MeasurementGuide() {
  const measurement = useMeasurement();
  const { transform } = useTransformState();
  const viewport = useViewport();

  return (
    <MeasurementGuideCanvas
      width={viewport?.clientWidth ?? 0}
      height={viewport?.clientHeight ?? 0}
      transform={transform}
      measurement={measurement}
      color={WorkbenchColors.red}
      className="absolute inset-0 z-30"
    />
  );
}

export { type Measurement };
