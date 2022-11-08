import { useDispatch } from "core/dispatch";
import { EditorState } from "core/states";
import React, { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

const noop = (e) => {
  e.preventDefault();
  e.stopPropagation();
  console.log(e.key);
};

export function EditorShortcutsProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const dispatch = useDispatch();

  const setMode = useCallback(
    (mode: EditorState["mode"]) => {
      dispatch({ type: "mode", mode: mode });
    },
    [dispatch]
  );

  const _save = keymap("ctrl-cmd", "s");
  const _preferences = keymap("ctrl-cmd", ",");
  const _toggle_comments = keymap("c");
  const _toggle_view = keymap("v");
  const _escape = keymap("esc");

  useHotkeys(_save.universal, () => {
    // dispatch({ type: "editor-save" });
  });

  useHotkeys(_preferences.universal, (e) => {
    // this is required to prevent browser's from opening preference page.
    e.preventDefault();
  });

  useHotkeys(_toggle_comments.universal, () => {
    setMode("comment");
  });

  useHotkeys(_toggle_view.universal, () => {
    setMode("view");
  });

  useHotkeys(_escape.universal, () => {
    setMode("view");
  });

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
    | "v"
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
