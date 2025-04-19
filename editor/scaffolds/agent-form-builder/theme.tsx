import { useEditorState } from "../editor";
import { fonts } from "@/theme/font-family";
import palettes from "@/theme/palettes";
import { AgentThemeProvider } from "../agent/theme";

export function FormEditorAgentThemeProvider({
  children,
}: React.PropsWithChildren<{
  palette?: keyof typeof palettes;
}>) {
  const [state] = useEditorState();

  const font = state.theme.fontFamily
    ? fonts[state.theme.fontFamily]
    : fonts.inter;

  const customcss = state.theme.customCSS;

  return (
    <AgentThemeProvider
      appearance={state.theme.appearance}
      font={font}
      customcss={customcss}
    >
      {children}
    </AgentThemeProvider>
  );
  //
}
