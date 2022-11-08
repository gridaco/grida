import { usePreferences } from "./editor-preference";
import React from "react";
import EditorPreferenceFigmaPage from "./pages/figma";

export function Router() {
  const state = usePreferences();
  const { route } = state;

  switch (route) {
    case "figma": {
      return <EditorPreferenceFigmaPage />;
    }
  }
  return <></>;
}
