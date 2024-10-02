import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import React, { createContext, useContext } from "react";

const SchemaDefinitionContext =
  createContext<SupabasePostgRESTOpenApi.SupabaseOpenAPIDefinitionJSONSchema | null>(
    null
  );

function SchemaDefinitionProvider({
  definition,
  children,
}: React.PropsWithChildren<{
  definition: SupabasePostgRESTOpenApi.SupabaseOpenAPIDefinitionJSONSchema | null;
}>) {
  return (
    <SchemaDefinitionContext.Provider value={definition}>
      {children}
    </SchemaDefinitionContext.Provider>
  );
}

const useSchemaDefinition = () => {
  return useContext(SchemaDefinitionContext);
};

export { SchemaDefinitionProvider, useSchemaDefinition };
