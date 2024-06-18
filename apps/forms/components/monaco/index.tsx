"use client";

import { useMonaco } from "@monaco-editor/react";
import { useEffect } from "react";

export function useMonacoTheme(
  monaco: ReturnType<typeof useMonaco>,
  theme: "dark" | "light" | (string | {})
) {
  console.log("useMonacoTheme", theme);
  // load theme initially
  useEffect(() => {
    import("monaco-themes/themes/Blackboard.json").then((data) => {
      data.colors["editor.background"] = "#0D0D0D";
      monaco?.editor.defineTheme("dark", data as any);
      monaco?.editor.setTheme(theme === "dark" ? "dark" : "light");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco]);

  // update theme when it changes
  useEffect(() => {
    monaco?.editor.setTheme(theme === "dark" ? "dark" : "light");
  }, [monaco, theme]);
}
