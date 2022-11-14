import { useEffect, useState } from "react";

export default function useSystemTheme() {
  const [theme, setTheme] = useState<"light" | "dark">();

  // load initially
  useEffect(() => {
    const isdark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(isdark ? "dark" : "light");
  }, []);

  // listen for changes
  useEffect(() => {
    const listener = (event) => {
      setTheme(event.matches ? "dark" : "light");
      console.log("theme changed", event.matches);
    };

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", listener);

    return () => {
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .removeEventListener("change", listener);
    };
  }, []);

  return theme;
}
