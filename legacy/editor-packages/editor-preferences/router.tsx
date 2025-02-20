import { useDispatch, usePreferences } from "./editor-preference";
import React from "react";
import EditorPreferenceFrameworkProfilePage from "./pages/framework-profile";
import AdvancedPreferencesPage from "./pages/advanced";
import { EditorPreferencePage } from "./pages/editor";
import { PreferencePageProps } from "./core";

export function Router({
  customRenderers,
}: {
  customRenderers: {
    [key: string]: React.FC<PreferencePageProps>;
  };
}) {
  const state = usePreferences();
  const dispatch = useDispatch();
  const { route } = state;

  const props = {
    dispatch,
    state,
  };

  switch (route) {
    case "/editor": {
      return <EditorPreferencePage {...props} />;
    }
    case "/framework": {
      return <EditorPreferenceFrameworkProfilePage {...props} />;
    }
    case "/advanced": {
      return <AdvancedPreferencesPage {...props} />;
    }
    default: {
      const renderer = customRenderers[route];
      if (renderer) {
        return <>{renderer(props)}</>;
      }
    }
  }
  throw new Error(`Route Not found: ${route}`);
}
