import { formcollection_sample_001_the_bundle } from "@/theme/templates/formcollection/samples";
import React, { createContext, useState, useEffect, ReactNode } from "react";

// Create a context with an empty array as the default value
const Context = createContext<any[]>([]);

interface ArrayItemProps {
  children: (item: any) => ReactNode;
}

export function Provider({
  data,
  children,
}: React.PropsWithChildren<{
  data: Array<any>;
}>) {
  return <Context.Provider value={data}>{children}</Context.Provider>;
}

// Export the context for use in other components
export const useArrayContext = () => React.useContext(Context);

// Array component to consume the context and pass data to ArrayItem
export function Builder({ children }: { children: ReactNode }) {
  const data = useArrayContext();

  return (
    <>
      {data.map((item, index) =>
        React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child, { item, key: index })
            : child
        )
      )}
    </>
  );
}

// ArrayItem component to render each item
export function Item({
  item,
  children,
}: {
  item: any;
  children: (item: any) => ReactNode;
}) {
  return <>{children(item)}</>;
}
