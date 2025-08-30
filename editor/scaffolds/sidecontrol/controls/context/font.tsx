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
}

const CurrentFontContext = React.createContext<CurrentFontContextValue>({
  axes: undefined,
  features: [],
  instances: [],
  weights: [],
});

export function CurrentFontProvider({
  fontFamily,
  fallbackWeights = false,
  children,
}: React.PropsWithChildren<{
  fontFamily?: string;
  fallbackWeights?: boolean;
}>) {
  const editor = useCurrentEditor();
  const [value, setValue] = React.useState<CurrentFontContextValue>({
    axes: undefined,
    features: [],
    instances: [],
    weights: [],
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
        setValue({
          axes: detail.axes,
          features: detail.features,
          instances: detail.instances,
          weights,
        });
      }
    })();
    return () => {
      canceled = true;
    };
  }, [editor, fontFamily, fallbackWeights]);

  return (
    <CurrentFontContext.Provider value={value}>
      {children}
    </CurrentFontContext.Provider>
  );
}

export function useCurrentFont() {
  return React.useContext(CurrentFontContext);
}
