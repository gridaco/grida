import React from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import type { FvarInstance, FontFeature } from "@grida/fonts/parse";
import type Typr from "@grida/fonts/typr";

interface CurrentFontContextValue {
  axes?: Record<string, Typr.FVARAxis>;
  features: FontFeature[];
  instances: FvarInstance[];
}

const CurrentFontContext = React.createContext<CurrentFontContextValue>({
  axes: undefined,
  features: [],
  instances: [],
});

export function CurrentFontProvider({
  fontFamily,
  children,
}: React.PropsWithChildren<{ fontFamily?: string }>) {
  const editor = useCurrentEditor();
  const [value, setValue] = React.useState<CurrentFontContextValue>({
    axes: undefined,
    features: [],
    instances: [],
  });

  React.useEffect(() => {
    let canceled = false;
    (async () => {
      if (!fontFamily) {
        if (!canceled) {
          setValue({ axes: undefined, features: [], instances: [] });
        }
        return;
      }
      const detail = await editor.getFontDetails(fontFamily);
      if (!detail) {
        if (!canceled) {
          setValue({ axes: undefined, features: [], instances: [] });
        }
        return;
      }
      if (!canceled) {
        setValue({
          axes: detail.axes,
          features: detail.features,
          instances: detail.instances,
        });
      }
    })();
    return () => {
      canceled = true;
    };
  }, [editor, fontFamily]);

  return (
    <CurrentFontContext.Provider value={value}>
      {children}
    </CurrentFontContext.Provider>
  );
}

export function useCurrentFont() {
  return React.useContext(CurrentFontContext);
}
