"use client";

import { useMemo, useContext } from "react";
import type { EditorState, GDocTable, GDocTableID } from "./state";
import { useDispatch, type FlatDispatcher } from "./dispatch";

import { Context } from "./provider";

export const useEditorState = (): [EditorState, FlatDispatcher] => {
  const state = useContext(Context);

  if (!state) {
    throw new Error(
      `[useEditorState]: No StateProvider: this is a logical error.`
    );
  }

  const dispatch = useDispatch();

  return useMemo(() => [state, dispatch], [state, dispatch]);
};
