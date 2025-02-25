import type { Data } from "@/lib/data";
import React, { createContext, useContext } from "react";

type DefinitionWithoutName = Omit<Data.Relation.TableDefinition, "name">;
const TableDefinitionContext = createContext<DefinitionWithoutName | null>(
  null
);

function TableDefinitionProvider({
  definition,
  children,
}: React.PropsWithChildren<{
  definition: DefinitionWithoutName | null;
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
