"use client";
import React from "react";
import { grida } from "@/grida";

const SchemaContext = React.createContext<
  | {
      properties: grida.program.schema.Properties;
    }
  | null
  | undefined
>(null);

export function SchemaProvider({
  schema,
  children,
}: React.PropsWithChildren<{
  schema?: {
    properties: grida.program.schema.Properties;
  };
}>) {
  return (
    <SchemaContext.Provider value={schema}>{children}</SchemaContext.Provider>
  );
}

export function useSchema() {
  const schema = React.useContext(SchemaContext);
  if (schema === null) {
    throw new Error("useSchema must be used within SchemaProvider");
  }
  return schema;
}
