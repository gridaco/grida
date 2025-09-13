import React from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import { editor } from "@/grida-canvas";

type CurrentFontStyleAttrubutes = {
  /**
   * axes defined by the face (ttf)
   */
  faceAxes?: { [tag: string]: editor.font_spec.UIFontFaceAxis };

  /**
   * features defined by the face (ttf)
   */
  faceFeatures: editor.font_spec.UIFontFaceFeature[] | undefined;
};

interface CurrentFontState {
  fontFamily: string;
  styles: Array<editor.font_spec.FontStyleInstance>;
  description: editor.api.FontStyleSelectDescription;
  currentStyleKey: editor.font_spec.FontStyleKey | null;
  currentStyle: CurrentFontStyleAttrubutes;
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
  /**
   * the current partial values of text style, responsible for matching the font face
   */
  description: editor.api.FontStyleSelectDescription;
}

function useFontDetails(fontFamily: string) {
  const editor = useCurrentEditor();

  const [font, setFont] = React.useState<editor.font_spec.UIFontFamily | null>(
    null
  );

  React.useEffect(() => {
    setFont(null);
    editor
      .getFontDetails(fontFamily)
      .then((detail) => {
        setFont(detail);
      })
      .catch((e) => {
        console.error("error getting font details", e);
        setFont(null);
      });
  }, [editor, fontFamily]);

  return font;
}

export function CurrentFontProvider({
  description,
  children,
}: React.PropsWithChildren<CurrentFontProviderProps>) {
  const fontFamily = description.fontFamily;
  const editor = useCurrentEditor();
  const font = useFontDetails(fontFamily);

  const ctx: CurrentFontContextValue = React.useMemo(() => {
    if (!font) return { type: "loading" };

    const fontFamily = font.family;
    const match = editor.selectFontStyle(description);

    return {
      type: "ready",
      state: {
        fontFamily: fontFamily,
        description: description,
        styles: font.styles,
        currentStyleKey: match ? match.key : null,
        currentStyle: {
          faceAxes: match?.face?.axes,
          faceFeatures: match?.face?.features,
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
  | { type: "ready"; state: CurrentFontStyleAttrubutes } {
  const f = useCurrentFontFamily();

  if (f.type === "loading") return { type: "loading" };
  else {
    return { type: "ready", state: f.state.currentStyle };
  }
}
