import { useContext, useMemo } from "react";
import { DataContext, ScopedVariableContext } from "./context";
import { access } from "@grida/tokens";

export function useData() {
  const dataContext = useContext(DataContext);
  if (!dataContext) {
    throw new Error("useData must be used within a DataProvider");
  }
  return dataContext.data;
}

export const useValue = <T = any>(key?: access.KeyPath<T>): any => {
  const data = useData();
  const scopedVariableContext = useContext(ScopedVariableContext);

  const variablePaths = scopedVariableContext
    ? scopedVariableContext.variablePaths
    : {};

  if (!key) {
    return data;
  }
  return access.access(data, key as any, {
    scopedIdentifiers: variablePaths,
  });
};

export const useSelectValue = <T>({
  keys,
}: {
  keys: Array<Array<string>>;
}): Record<string, any> => {
  const data = useData();
  const scopedVariableContext = useContext(ScopedVariableContext);

  const variablePaths = scopedVariableContext
    ? scopedVariableContext.variablePaths
    : {};

  return useMemo(() => {
    const selected = access.select(data, keys as any, {
      scopedIdentifiers: variablePaths,
    });
    // console.log(selected, data, keys, variablePaths);
    return selected;
  }, [keys, data, variablePaths]);
};
