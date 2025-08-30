import React from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import type { FvarInstance, FontFeature } from "@grida/fonts/parse";
import type Typr from "@grida/fonts/typr";

const DEFAULT_WEIGHTS = [
  { value: "100", label: "Thin" },
  { value: "200", label: "Extra Light" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semi Bold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra Bold" },
  { value: "900", label: "Black" },
];

interface CurrentFontContextValue {
  axes?: Record<string, Typr.FVARAxis>;
  features: FontFeature[];
  instances: FvarInstance[];
  weights: Array<{ value: string; label: string }>;
  matchingInstanceName?: string;
  currentFontVariations?: Record<string, number>;
}

const CurrentFontContext = React.createContext<CurrentFontContextValue>({
  axes: undefined,
  features: [],
  instances: [],
  weights: [],
});

/**
 * Get the exact matching instance from a list of instances based on current values
 * @param instances - Array of font variation instances
 * @param values - Current font variation values
 * @returns The matching instance if found, undefined otherwise
 */
function getMatchingInstance(
  instances: FvarInstance[],
  values: Record<string, number>
): FvarInstance | undefined {
  if (!instances || instances.length === 0) return undefined;

  return instances.find((inst) => {
    // Check if all coordinates in the instance match the current values exactly
    const instanceCoords = inst.coordinates;

    // First, check if all instance coordinates are present in current values
    for (const [axis, value] of Object.entries(instanceCoords)) {
      if (values[axis] !== value) {
        return false;
      }
    }

    // Then, check if all current values are present in instance coordinates
    // This ensures we don't match when current values have additional axes
    for (const [axis, value] of Object.entries(values)) {
      if (instanceCoords[axis] !== value) {
        return false;
      }
    }

    return true;
  });
}

export function CurrentFontProvider({
  fontFamily,
  fontWeight,
  fontVariations,
  fallbackWeights = false,
  children,
}: React.PropsWithChildren<{
  fontFamily?: string;
  fontWeight?: number;
  fontVariations?: Record<string, number>;
  fallbackWeights?: boolean;
}>) {
  const editor = useCurrentEditor();
  const [value, setValue] = React.useState<CurrentFontContextValue>({
    axes: undefined,
    features: [],
    instances: [],
    weights: [],
    matchingInstanceName: undefined,
  });

  React.useEffect(() => {
    let canceled = false;
    (async () => {
      if (!fontFamily) {
        if (!canceled) {
          setValue({
            axes: undefined,
            features: [],
            instances: [],
            weights: [],
          });
        }
        return;
      }
      const detail = await editor.getFontDetails(fontFamily);
      if (!detail) {
        if (!canceled) {
          setValue({
            axes: undefined,
            features: [],
            instances: [],
            weights: [],
          });
        }
        return;
      }

      // Extract weight information from wght axis and instances
      const weights: Array<{ value: string; label: string }> = [];

      // Add weights from instances first (these are named instances)
      if (detail.instances && detail.instances.length > 0) {
        const wghtInstances = detail.instances
          .map((inst) => {
            const wght = inst.coordinates["wght"];
            if (typeof wght !== "number") return null;
            return { value: wght.toString(), label: inst.name };
          })
          .filter(Boolean) as Array<{ value: string; label: string }>;

        if (wghtInstances.length > 0) {
          weights.push(...wghtInstances);
        }
      }

      // If no instances or no wght instances, and fallbackWeights is true, add default weights
      if (weights.length === 0 && fallbackWeights) {
        weights.push(...DEFAULT_WEIGHTS);
      }

      if (!canceled) {
        setValue((prev) => ({
          axes: detail.axes,
          features: detail.features,
          instances: detail.instances,
          weights,
          matchingInstanceName: prev.matchingInstanceName,
        }));
      }
    })();
    return () => {
      canceled = true;
    };
  }, [editor, fontFamily, fallbackWeights]);

  const matchingInstanceName = React.useMemo(() => {
    if (!value.instances || value.instances.length === 0) return undefined;
    const current: Record<string, number> = {
      ...(fontVariations || {}),
    };
    if (typeof fontWeight === "number") {
      current["wght"] = fontWeight;
    }
    const matched = getMatchingInstance(value.instances, current);
    return matched?.name;
  }, [value.instances, fontWeight, fontVariations]);

  const currentFontVariations = React.useMemo(() => {
    const current: Record<string, number> = {
      ...(fontVariations || {}),
    };
    if (typeof fontWeight === "number") {
      current["wght"] = fontWeight;
    }
    return Object.keys(current).length > 0 ? current : undefined;
  }, [fontWeight, fontVariations]);

  const ctx = React.useMemo(
    () => ({ ...value, matchingInstanceName, currentFontVariations }),
    [value, matchingInstanceName, currentFontVariations]
  );

  return (
    <CurrentFontContext.Provider value={ctx}>
      {children}
    </CurrentFontContext.Provider>
  );
}

export function useCurrentFont() {
  return React.useContext(CurrentFontContext);
}
