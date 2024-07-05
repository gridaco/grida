import * as palettes from "@/theme/palettes";
import useVariablesCSS from "../playground/use-variables-css";
import { stringfyThemeVariables } from "@/theme/palettes/utils";
import { useEditorState } from "./provider";

export function PaletteProvider({ children }: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();
  useVariablesCSS(
    state.theme.palette
      ? stringfyThemeVariables(palettes[state.theme.palette] as any)
      : undefined
  );

  return <>{children}</>;
}
