import { usePreferences } from "./editor-preference";
import React from "react";
import EditorPreferenceFigmaPage from "./pages/figma";
import EditorPreferenceFigmaPersonalAccessTokenPage from "./pages/figma/personal-access-token";
import EditorPreferenceFrameworkProfilePage from "./pages/framework-profile";

export function Router() {
  const state = usePreferences();
  const { route } = state;

  switch (route) {
    case "/figma": {
      return <EditorPreferenceFigmaPage />;
    }
    case "/figma/personal-access-token": {
      return <EditorPreferenceFigmaPersonalAccessTokenPage />;
    }
    case "/framework": {
      return <EditorPreferenceFrameworkProfilePage />;
    }
  }
  return <></>;
}
