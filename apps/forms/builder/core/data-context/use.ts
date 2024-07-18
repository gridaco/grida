import { useContext, useMemo } from "react";
import { DataContext } from "./context";
import { Access } from "@/ast";

export const useValue = <T = any>(key: Access.KeyPath<T>): any => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useValue must be used within a DataProvider");
  }

  const { data } = context;

  const value = Access.access(data, key as any);

  return value;
};

export const useSelectValue = <T>({
  keys,
}: {
  keys: Array<Array<string>>;
}): Record<string, any> => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useProperties must be used within a DataProvider");
  }
  const { data } = context;

  const values = useMemo(() => {
    // @ts-expect-error
    return Access.select(data, keys);
  }, [keys, data]);

  return values;
};

export const useNamespaces = (): string[] => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useNamespaces must be used within a DataProvider");
  }
  return context.namespaces;
};
