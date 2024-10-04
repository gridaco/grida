import type { Data } from "@/lib/data";
import React, { createContext, useContext } from "react";

const TableDefinitionContext =
  createContext<Data.Relation.TableDefinition | null>(null);

function TableDefinitionProvider({
  definition,
  children,
}: React.PropsWithChildren<{
  definition: Data.Relation.TableDefinition | null;
}>) {
  return (
    <TableDefinitionContext.Provider value={definition}>
      {children}
    </TableDefinitionContext.Provider>
  );
}

const useTableDefinition = () => {
  return useContext(TableDefinitionContext);
};

export { TableDefinitionProvider, useTableDefinition };
