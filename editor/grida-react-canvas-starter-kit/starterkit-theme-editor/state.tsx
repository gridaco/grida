"use clinet";
import React, { useContext, useEffect, useMemo, useReducer } from "react";
import type { ColorPalette } from "@/k/tailwindcolors";
import { produce } from "immer";

interface SchemedColorToken {
  /**
   * css variable name (including `--`)
   */
  name: string;
  description: string;

  /**
   * value for light (default) theme
   */
  light: string;

  /**
   * value for dark theme
   */
  dark: string;
}

export interface ThemeEditorState {
  colorscheme: "light" | "dark";
  theme: {
    colors: Record<string, SchemedColorToken>;
    palletes: Record<string, ColorPalette>;
  };
}

const ThemeEditorStateContext = React.createContext<ThemeEditorState>({
  colorscheme: "light",
  theme: {
    colors: {},
    palletes: {},
  },
});

type Dispatcher = (action: Action) => void;
const __noop = () => {};

const DispatchContext = React.createContext<Dispatcher>(__noop);

type Action = {
  type: "schemed/colors/update";
  scheme: "light" | "dark";
  key: string;
  value: string;
};

function reducer(state: ThemeEditorState, action: Action) {
  return produce(state, (draft) => {
    switch (action.type) {
      case "schemed/colors/update": {
        const { scheme, key, value } = action;

        if (!(key in draft.theme.colors)) {
          throw new Error(`Color key ${key} not found`);
        }

        draft.theme.colors[key][scheme] = value;
        break;
      }
      default:
        break;
    }
  });
}

export function ThemeEditorProvider({
  children,
  colorscheme,
  initialState,
  onChange,
}: {
  children: React.ReactNode;
  colorscheme: "light" | "dark";
  initialState: Pick<ThemeEditorState, "theme">;
  onChange?: (state: ThemeEditorState) => void;
}) {
  const [state, dispatch] = useReducer<
    React.Reducer<ThemeEditorState, Action>,
    ThemeEditorState
  >(reducer, { ...initialState, colorscheme }, (initial) => initial);

  useEffect(() => {
    onChange?.(state);
  }, [state]);

  return (
    <ThemeEditorStateContext.Provider value={{ ...state, colorscheme }}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </ThemeEditorStateContext.Provider>
  );
}

export function useThemeEditor() {
  const dispatch = useContext(DispatchContext);
  const state = useContext(ThemeEditorStateContext);

  const updateSchemeColor = React.useCallback(
    (scheme: "light" | "dark", key: string, value: string) => {
      dispatch({ type: "schemed/colors/update", scheme, key, value });
    },
    [dispatch]
  );

  return useMemo(
    () => ({
      ...state,
      updateSchemeColor,
    }),
    [state, updateSchemeColor]
  );
}
