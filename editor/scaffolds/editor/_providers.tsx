import React from "react";
import { useHotkeys } from "react-hotkeys-hook";
export function EditorDefaultProviders(props: { children: React.ReactNode }) {
  return <ShortcutsProvider>{props.children}</ShortcutsProvider>;
}

function ShortcutsProvider(props: { children: React.ReactNode }) {
  const noop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const _save = keymap("ctrl-cmd", "s");
  const _preferences = keymap("ctrl-cmd", ",");

  useHotkeys(_save.universal, noop);
  useHotkeys(_preferences.universal, noop);

  return <>{props.children}</>;
}

const keymap = (
  ...c: ("ctrl" | "cmd" | "ctrl-cmd" | "shift" | "a" | "p" | "s" | ",")[]
) => {
  const magic_replacer = (s: string, os: "win" | "mac") => {
    return s.replaceAll("ctrl-cmd", os === "win" ? "ctrl" : "cmd");
  };

  const win = magic_replacer(c.join("+"), "win");
  const mac = magic_replacer(c.join("+"), "mac");
  const universal = [win, mac].join(", ");
  return { win, mac, universal };
};
