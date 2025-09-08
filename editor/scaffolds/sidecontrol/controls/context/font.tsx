import React from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import type { FontFeature } from "@grida/fonts/parse";
import type Typr from "@grida/fonts/typr";
import { editor } from "@/grida-canvas";

type CurrentFontStyle = {
  /**
   * the postscript name of the current font style, either instance.postscriptName (variable) or face.postscriptName (static)
   */
  postscriptName?: string;

  /**
   * axes defined by the face (ttf)
   */
  faceAxes?: Record<string, Typr.FVARAxis>;

  /**
   * features defined by the face (ttf)
   */
  faceFeatures: FontFeature[] | undefined;
};

interface CurrentFontState {
  family: string;
  styles: Array<editor.font.FontStyleInstance>;
  description: CurrentFontDescription;
  currentStyle: CurrentFontStyle;
}

interface CurrentFontDescription {
  fontPostscriptName?: string;
  fontWeight?: number;
  fontVariations?: Record<string, number>;
}

type CurrentFontContextValue =
  | {
      type: "loading";
    }
  | { type: "ready"; state: CurrentFontState };

const CurrentFontContext = React.createContext<CurrentFontContextValue | null>(
  null
);

interface CurrentFontProviderProps {
  fontFamily: string;

  /**
   * the current partial values of text style, responsible for matching the font face
   */
  description: CurrentFontDescription;
}

function useFontDetails(fontFamily: string) {
  const editor = useCurrentEditor();

  const [font, setFont] = React.useState<editor.font.UIFontFamily | null>(null);

  React.useEffect(() => {
    setFont(null);
    editor
      .getFontDetails(fontFamily)
      .then((detail) => {
        setFont(detail);
      })
      .catch(() => {
        setFont(null);
      });
  }, [editor, fontFamily]);

  return font;
}

export function CurrentFontProvider({
  fontFamily,
  description,
  children,
}: React.PropsWithChildren<CurrentFontProviderProps>) {
  const editor = useCurrentEditor();
  const font = useFontDetails(fontFamily);

  const ctx: CurrentFontContextValue = React.useMemo(() => {
    if (!font) return { type: "loading" };

    const match = editor.matchFontFace(font.family, description);

    return {
      type: "ready",
      state: {
        family: font.family,
        description: {
          fontVariations: description.fontVariations,
          fontWeight: description.fontWeight,
        },
        styles: font.styles,
        currentStyle: {
          faceAxes: match?.face?.axes,
          faceFeatures: match?.face?.features,
          postscriptName:
            match?.instance?.postscriptName || match?.face?.postscriptName,
        },
      } satisfies CurrentFontState,
    } satisfies CurrentFontContextValue;
  }, [font, description]);

  return (
    <CurrentFontContext.Provider value={ctx}>
      {children}
    </CurrentFontContext.Provider>
  );
}

export function useCurrentFontFamily() {
  const ctx = React.useContext(CurrentFontContext);
  if (!ctx) {
    throw new Error(
      "useCurrentFontFamily must be used within a CurrentFontProvider"
    );
  }
  return ctx;
}

export function useCurrentFontFace():
  | { type: "loading" }
  | { type: "ready"; state: CurrentFontStyle } {
  const f = useCurrentFontFamily();

  if (f.type === "loading") return { type: "loading" };
  else {
    return { type: "ready", state: f.state.currentStyle };
  }
}
