"use client";

import Editor, { useMonaco } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import type { editor } from "monaco-editor";

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

export function ThemedMonacoEditor(props: React.ComponentProps<typeof Editor>) {
  const { resolvedTheme } = useTheme();

  const monaco = useMonaco();
  useMonacoTheme(monaco, resolvedTheme ?? "light");

  return <Editor {...props} />;
}

export function AutoHeightThemedMonacoEditor({
  onMount,
  className,
  ...props
}: React.ComponentProps<typeof ThemedMonacoEditor> & {
  className?: string;
}) {
  const [editorHeight, setEditorHeight] = useState(200); // Default height

  const handleEditorDidMount = (
    editor: editor.IStandaloneCodeEditor,
    monaco: typeof import("monaco-editor")
  ) => {
    if (onMount) onMount(editor, monaco);
    // Adjust the height based on content
    const updateHeight = () => {
      const contentHeight = editor.getContentHeight();
      setEditorHeight(contentHeight);
    };

    // Listen to content changes
    editor.onDidContentSizeChange(updateHeight);

    // Set the initial height
    updateHeight();
  };

  return (
    <div
      className={className}
      style={{
        height: editorHeight + 2, // Dynamically updated height
      }}
    >
      <ThemedMonacoEditor
        {...props}
        height={editorHeight} // Dynamically set height
        onMount={handleEditorDidMount}
      />
    </div>
  );
}
