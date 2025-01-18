"use client";
import React from "react";
import { grida } from "@/grida";

type Schema = {
  properties: grida.program.schema.Properties;
};

const SchemaContext = React.createContext<Schema | null | undefined>(null);

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

export function useSchema(): Schema | undefined {
  const schema = React.useContext(SchemaContext);
  if (schema === null) {
    throw new Error("useSchema must be used within SchemaProvider");
  }
  return schema;
}
