import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  FC,
  useMemo,
  useEffect,
} from "react";

interface RootDataContextProps {
  rootData: Record<string, any>;
  updateRootData: (namespace: string, value: any) => void;
  addTransformer: (key: string, transformer: TransformerFunction) => void;
  transformers: Record<string, TransformerFunction>;
  namespaces: string[];
}

type TransformerFunction = (path: string, data: Record<string, any>) => any;

const RootDataContext = createContext<RootDataContextProps | undefined>(
  undefined
);

interface RootDataContextProviderProps {
  children: ReactNode;
}

export const RootDataContextProvider: FC<RootDataContextProviderProps> = ({
  children,
}) => {
  const [rootData, setRootData] = useState<Record<string, any>>({});
  const [transformers, setTransformers] = useState<
    Record<string, TransformerFunction>
  >({});
  const [namespaces, setNamespaces] = useState<string[]>([]);

  const updateRootData = (namespace: string, value: any) => {
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
  data: Record<string, any>;
  updateData: (key: string, value: any) => void;
  transformers: Record<string, TransformerFunction>;
  namespaces: string[];
}

interface DataProviderProps {
  namespace?: string;
  initialData?: Record<string, any>;
  children: ReactNode;
}

export const DataProvider: FC<DataProviderProps> = ({
  namespace,
  initialData = {},
  children,
}) => {
  const rootContext = useContext(RootDataContext);
  if (!rootContext) {
    throw new Error(
      "DataProvider must be used within a RootDataContextProvider"
    );
  }
  const {
    rootData,
    updateRootData,
    transformers,
    namespaces: rootNamespaces,
  } = rootContext;

  const [localData, setLocalData] = useState<Record<string, any>>(initialData);
  const [localNamespaces, setLocalNamespaces] = useState<string[]>(
    namespace ? [namespace] : []
  );

  const updateData = (key: string, value: any) => {
    if (namespace) {
      setLocalData((prevData) => ({
        ...prevData,
        [key]: value,
      }));
      if (!localNamespaces.includes(key)) {
        setLocalNamespaces([...localNamespaces, key]);
      }
    } else {
      updateRootData(key, value);
    }
  };

  const combinedData = useMemo(
    () => ({ ...rootData, ...localData }),
    [rootData, localData]
  );
  const combinedNamespaces = useMemo(
    () => Array.from(new Set([...rootNamespaces, ...localNamespaces])),
    [rootNamespaces, localNamespaces]
  );

  return (
    <DataContext.Provider
      value={{
        data: combinedData,
        updateData,
        transformers,
        namespaces: combinedNamespaces,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
