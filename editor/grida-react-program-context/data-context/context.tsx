import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  FC,
  useMemo,
} from "react";
import { type access } from "@grida/tokens";

interface RootDataContextProps {
  rootData: Record<string, unknown>;
  updateRootData: (namespace: string, value: unknown) => void;
  addTransformer: (key: string, transformer: TransformerFunction) => void;
  transformers: Record<string, TransformerFunction>;
  namespaces: string[];
}

type TransformerFunction = (
  path: string,
  data: Record<string, unknown>
) => unknown;

const RootDataContext = createContext<RootDataContextProps | undefined>(
  undefined
);

interface RootDataContextProviderProps {
  children: ReactNode;
}

export const ProgramDataContextHost: FC<RootDataContextProviderProps> = ({
  children,
}) => {
  const [rootData, setRootData] = useState<Record<string, unknown>>({});
  const [transformers, setTransformers] = useState<
    Record<string, TransformerFunction>
  >({});
  const [namespaces, setNamespaces] = useState<string[]>([]);

  const updateRootData = (namespace: string, value: unknown) => {
    setRootData((prevData) => ({
      ...prevData,
      [namespace]: value,
    }));
    if (!namespaces.includes(namespace)) {
      setNamespaces([...namespaces, namespace]);
    }
  };

  const addTransformer = (key: string, transformer: TransformerFunction) => {
    setTransformers((prevTransformers) => ({
      ...prevTransformers,
      [key]: transformer,
    }));
  };

  const contextValue = useMemo(
    () => ({
      rootData,
      updateRootData,
      addTransformer,
      transformers,
      namespaces,
    }),
    [rootData, transformers, namespaces]
  );

  return (
    <RootDataContext.Provider value={contextValue}>
      {children}
    </RootDataContext.Provider>
  );
};

export const DataContext = createContext<DataContextProps | undefined>(
  undefined
);

interface DataContextProps {
  data: Record<string, unknown>;
  transformers: Record<string, TransformerFunction>;
  namespaces: string[];
}

interface DataProviderProps {
  namespace?: string;
  data?: Record<string, unknown>;
  children: ReactNode;
}

export const DataProvider: FC<DataProviderProps> = ({
  namespace,
  data: localdata = {},
  children,
}) => {
  const rootContext = useContext(RootDataContext);
  if (!rootContext) {
    throw new Error(
      "DataProvider must be used within a ProgramDataContextHost"
    );
  }
  const { rootData, transformers, namespaces: rootNamespaces } = rootContext;

  const combinedData = useMemo(
    () => ({ ...rootData, ...localdata }),
    [rootData, localdata]
  );
  const combinedNamespaces = useMemo(() => {
    if (!namespace) {
      return rootNamespaces;
    }
    return Array.from(new Set([...rootNamespaces, namespace]));
  }, [rootNamespaces, namespace]);

  return (
    <DataContext.Provider
      value={{
        data: combinedData,
        transformers,
        namespaces: combinedNamespaces,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const ScopedVariableContext = createContext<
  ScopedVariableContextProps | undefined
>(undefined);

interface ScopedVariableContextProps {
  variablePaths: access.ScopedIdentifiersContext["scopedIdentifiers"];
}

/**
 * Does not support nested scoped variable providers.
 * This only works for a single level of scoping.
 */
export const ScopedVariableBoundary: FC<{
  identifier: string;
  expression: access.ScopedIdentifiersContext["scopedIdentifiers"][string];
  children: ReactNode;
}> = ({ identifier, expression, children }) => {
  const parentScopedContext = useContext(ScopedVariableContext);

  const variablePaths = useMemo(
    () => ({
      ...(parentScopedContext ? parentScopedContext.variablePaths : {}),
      [identifier]: expression,
    }),
    [parentScopedContext, identifier, expression]
  );

  return (
    <ScopedVariableContext.Provider value={{ variablePaths }}>
      {children}
    </ScopedVariableContext.Provider>
  );
};

export const useScopedVariable = () => {
  return useContext(ScopedVariableContext);
};
