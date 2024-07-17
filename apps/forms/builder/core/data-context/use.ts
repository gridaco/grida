import { useContext, useMemo } from "react";
import { DataContext } from "./context";
import { Access } from "@/ast";

export const useValue = (key: string): any => {
  const context = useContext(DataContext);
  if (!context) {
    // throw new Error("useValue must be used within a DataProvider");
    return null;
  }

  const { data, transformers } = context;

  const value = key.split(".").reduce((acc, part) => acc && acc[part], data);

  // if (value && value.kind === "template" && transformers[value.kind]) {
  //   return transformers[value.kind](value.path, data);
  // }

  return { value };
};

export const useSelectValue = <T>({
  keys,
}: {
  keys: Array<Array<string>>;
}): Record<string, any> => {
  const context = useContext(DataContext);
  if (!context) {
    // throw new Error("useProperties must be used within a DataProvider");
    return {};
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
