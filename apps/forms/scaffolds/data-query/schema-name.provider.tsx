"use client";
import React, { createContext, useContext } from "react";

type SchemaName = string | undefined;
const SchemaNameContext = createContext<SchemaName | null>(null);

/**
 * SchemaNameProvider is a simple provider to define a current working schema name.
 *
 * this is used for query context to specify the working schema name.
 * this is useful because in postgrest or other query context, cross-schema query is not allowed.
 * @returns
 */
export function SchemaNameProvider({
  schema,
  children,
}: React.PropsWithChildren<{ schema: SchemaName }>) {
  return (
    <SchemaNameContext.Provider value={schema}>
      {children}
    </SchemaNameContext.Provider>
  );
}

/**
 * @returns the current working schema name
 */
export function useSchemaName() {
  const context = useContext(SchemaNameContext);
  if (context === null) {
    throw new Error("useSchemaName must be used within a SchemaNameProvider");
  }

  return context;
}
