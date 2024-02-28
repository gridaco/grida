import { useDispatch } from "core/dispatch";
import { EditorState } from "core/states";
import React, { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useOpenPreferences } from "@code-editor/preferences";
import { useRouter } from "next/router";
const noop = (e) => {
  e.preventDefault();
  e.stopPropagation();
  console.log(e.key);
};

export function EditorShortcutsProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const router = useRouter();
  const dispatch = useDispatch();

  const setDesignerMode = useCallback(
    (mode: EditorState["designerMode"]) => {
      dispatch({ type: "designer-mode", mode: mode });
    },
    [dispatch]
  );

  const redo = useCallback(() => {
    dispatch({ type: "redo" });
  }, [dispatch]);

  const undo = useCallback(() => {
    dispatch({ type: "undo" });
  }, [dispatch]);

  const cut = useCallback(() => {
    dispatch({ type: "cut" });
  }, [dispatch]);

  // const copy = useCallback(() => {
  //   dispatch({ type: "copy" });
  // }, [dispatch]);

  const paste = useCallback(() => {
    dispatch({ type: "paste" });
  }, [dispatch]);

  const openPreferences = useOpenPreferences();

  const _copy = keymap("ctrl-cmd", "c");
  const _paste = keymap("ctrl-cmd", "v");
  const _cut = keymap("ctrl-cmd", "x");
  const _undo = keymap("ctrl-cmd", "z");
  const _redo = keymap("ctrl-cmd", "shift", "z");
  const _save = keymap("ctrl-cmd", "s");
  const _backtofiles = keymap("ctrl-cmd", "esc");
  const _preferences = keymap("ctrl-cmd", ",");
  const _toggle_comments = keymap("c");
  const _toggle_view = keymap("v");
  const _escape = keymap("esc");

  // translate
  const _up = keymap("up");
  const _down = keymap("down");
  const _left = keymap("left");
  const _right = keymap("right");

  useHotkeys(_save.universal, (e) => {
    // disables the save html action on browser
    e.preventDefault();
  });

  useHotkeys(_undo.universal, (e) => {
    undo();
  });

  useHotkeys(_redo.universal, (e) => {
    redo();
  });

  // useHotkeys(_cut.universal, (e) => {
  //   cut();
  // });

  // useHotkeys(_copy.universal, (e) => {
  //   copy();
  // });

  // useHotkeys(_paste.universal, (e) => {
  //   paste();
  // });

  // translate
  useHotkeys(_up.universal, noop);
  useHotkeys(_down.universal, noop);
  useHotkeys(_left.universal, noop);
  useHotkeys(_right.universal, noop);

  useHotkeys(_backtofiles.universal, (e) => {
    router.push("/");
  });

  useHotkeys(_preferences.universal, (e) => {
    // this is required to prevent browser's from opening preference page.
    e.preventDefault();
    openPreferences();
  });

  useHotkeys(_toggle_comments.universal, () => {
    setDesignerMode("comment");
  });

  useHotkeys(_toggle_view.universal, () => {
    setDesignerMode("inspect");
  });

  useHotkeys(_escape.universal, () => {
    setDesignerMode("inspect");
  });

  return <>{children}</>;
}

const keymap = (
  ...c: (
    | "esc"
    // meta keys
    | "ctrl"
    | "cmd"
    | "ctrl-cmd"
    | "shift"
    | "alt"
    // arrow keys
    | "up"
    | "down"
    | "left"
    | "right"
    //
    | "z"
    | "x"
    | "a"
    | "c"
    | "p"
    | "n"
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
