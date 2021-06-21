import { createContext, useContext, useEffect } from "react";

export type GlobalInputBlurContextValue = {
  addListener: (f: () => void) => void;
  removeListener: (f: () => void) => void;
  trigger: () => void;
};

const defaultValue = (() => {
  const listeners: (() => void)[] = [];

  const value: GlobalInputBlurContextValue = {
    addListener(f) {
      listeners.push(f);
    },
    removeListener(f) {
      const index = listeners.indexOf(f);
      if (index === -1) return;
      listeners.splice(index, 1);
    },
    trigger() {
      listeners.forEach((f) => {
        f();
      });
    },
  };

  return value;
})();

const GlobalInputBlurContext =
  createContext<GlobalInputBlurContextValue>(defaultValue);

export const GlobalInputBlurProvider = GlobalInputBlurContext.Provider;

/**
 * Some components store their editable state internally.
 * We trigger this event before selection changes so that they can commit their
 * edits before they unmount. This is more manual but simpler than doing so during
 * the unmount phase (e.g. the return function of `useEffect`), since handlers are
 * guaranteed to be called with the current data.
 */
export const useGlobalInputBlur = (): GlobalInputBlurContextValue => {
  return useContext(GlobalInputBlurContext);
};

export function useGlobalInputBlurListener(f: () => void) {
  const context = useGlobalInputBlur();

  useEffect(() => {
    context.addListener(f);

    return () => {
      context.removeListener(f);
    };
  }, [context, f]);
}

export function useGlobalInputBlurTrigger() {
  return useGlobalInputBlur().trigger;
}
