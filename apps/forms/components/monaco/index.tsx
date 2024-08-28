"use client";

import { useMonaco } from "@monaco-editor/react";
import { useEffect, useState } from "react";

export function useMonacoTheme(
  monaco: ReturnType<typeof useMonaco>,
  theme: "dark" | "light" | (string | {})
) {
  const [themeloaded, setThemeLoaded] = useState(false);
  // load theme initially
  useEffect(() => {
    if (!monaco) return;
    import("monaco-themes/themes/Blackboard.json").then((data) => {
      data.colors["editor.background"] = "#0D0D0D";
      monaco.editor.defineTheme("dark", data as any);
      monaco.editor.setTheme(theme === "dark" ? "dark" : "light");
      setThemeLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco]);

  // update theme when it changes
  useEffect(() => {
    if (!themeloaded) return;
    if (!monaco) return;
    monaco.editor.setTheme(theme === "dark" ? "dark" : "light");
  }, [monaco, theme, themeloaded]);
}
