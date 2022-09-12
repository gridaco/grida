import { ThemeProvider as TP } from "@emotion/react";
import React, { useEffect } from "react";
import { useCookies } from "react-cookie";
import { useSetRecoilState, useRecoilValue } from "recoil";
import { selectSystemTheme, selectTheme, themeState } from "./state";
import { theme } from "./theme";

export function ThemeProvider({
  theme: explicit = "light",
  children,
}: React.PropsWithChildren<{
  theme?: "light" | "dark";
}>) {
  const [cookies, setCookie, removeCookie] = useCookies(["theme"]);

  const currentTheme = useRecoilValue(themeState);

  const _theme =
    currentTheme.system === "pending"
      ? theme[explicit]
      : theme[currentTheme.mode];

  const setMode = useSetRecoilState(selectTheme);
  const setSystem = useSetRecoilState(selectSystemTheme);

  useEffect(() => {
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      setSystem("dark");
    }

    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      setSystem("dark");
    }
  }, [setSystem]);

  useEffect(() => {
    return setMode(currentTheme.system as "light" | "dark");
  }, [currentTheme.system, setMode]);

  useEffect(() => {
    // set theme info to cookie
    setCookie("theme", currentTheme.mode);
  }, [currentTheme.mode]);

  return <TP theme={_theme}>{children}</TP>;
}
