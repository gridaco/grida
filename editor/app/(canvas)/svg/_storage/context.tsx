"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { SvgDocStore } from "./doc-store";

const SvgDocStoreContext = createContext<SvgDocStore | null>(null);

export function SvgDocStoreProvider({
  opfsBase,
  defaultSvg,
  children,
}: PropsWithChildren<{
  opfsBase: readonly string[];
  defaultSvg: string;
}>) {
  const [store] = useState(() => new SvgDocStore({ opfsBase, defaultSvg }));
  useEffect(() => {
    void store.hydrate();
    return () => store.dispose();
  }, [store]);
  return (
    <SvgDocStoreContext.Provider value={store}>
      {children}
    </SvgDocStoreContext.Provider>
  );
}

export function useSvgDocStore(): SvgDocStore {
  const s = useContext(SvgDocStoreContext);
  if (!s)
    throw new Error("useSvgDocStore must be used inside <SvgDocStoreProvider>");
  return s;
}
