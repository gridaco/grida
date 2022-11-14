import React, { useEffect } from "react";
import { useDispatch } from "@code-editor/preferences";
import PreferencesAboutFigmaFile from "./preferences-about-this-figma-file";
import PreferencesFigmaPersonalAccessTokens from "./preferences-figma-personal-access-tokens";
export function EditorPreferencesRoutesProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch({
      type: "register",
      route: "/figma",
      name: "Figma",
      icon: "@radix-ui/react-icons/FigmaLogoIcon",
      renderer: (p) => <PreferencesAboutFigmaFile {...p} />,
    });

    dispatch({
      type: "register",
      route: "/figma/personal-access-tokens",
      name: "Personal Access Tokens",
      icon: "@radix-ui/react-icons/FigmaLogoIcon",
      renderer: (p) => <PreferencesFigmaPersonalAccessTokens {...p} />,
    });
  }, []);

  return <>{children}</>;
}
