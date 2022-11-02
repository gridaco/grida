import React from "react";
import { useHotkeys } from "react-hotkeys-hook";

const noop = (e) => {
  e.preventDefault();
  e.stopPropagation();
  console.log(e.key);
};

export function EditorShortcutsProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const _save = keymap("ctrl-cmd", "s");
  const _preferences = keymap("ctrl-cmd", ",");
  const _toggle_comments = keymap("c");
  const _escape = keymap("esc");

  useHotkeys(_save.universal, noop);
  useHotkeys(_preferences.universal, noop);
  useHotkeys(_toggle_comments.universal, noop);
  useHotkeys(_escape.universal, noop);

  return <>{children}</>;
}

const keymap = (
  ...c: (
    | "esc"
    | "ctrl"
    | "cmd"
    | "ctrl-cmd"
    | "shift"
    | "a"
    | "c"
    | "p"
    | "s"
    | ","
  )[]
) => {
  const magic_replacer = (s: string, os: "win" | "mac") => {
    return replaceAll(s, "ctrl-cmd", os === "win" ? "ctrl" : "cmd");
  };

  const win = magic_replacer(c.join("+"), "win");
  const mac = magic_replacer(c.join("+"), "mac");
  const universal = [win, mac].join(", ");
  return { win, mac, universal };
};

function _escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function replaceAll(str, match, replacement) {
  return str.replace(new RegExp(_escapeRegExp(match), "g"), () => replacement);
}
