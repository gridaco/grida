import { Data } from "@/lib/data";
import React, { createContext, useState } from "react";
import { useXSupabaseTableSearch } from "@/scaffolds/x-supabase/use-x-supabase-table-search";
import { GridaXSupabase } from "@/types";

interface LookupState {
  isLoading: boolean;
  /**
   * the data of the referenced row(s)
   *
   * since the fk can lead to multiple rows, we don't strictly enforce the type to be a single row
   *
   * result.data[0] is the first row
   */
  result: GridaXSupabase.XSBSearchResult | undefined;
}

const ReferencedRowLookupContext = createContext<LookupState | null>(null);

function XSBReferencedRowLookupProvider({
  reference,
  children,
}: React.PropsWithChildren<{
  reference: {
    supabase_project_id: number;
    supabase_schema_name: string;
    relation: Data.Relation.NonCompositeRelationship;
    fk_value: string | number | undefined;
  };
}>) {
  //

  const { data, isLoading } = useXSupabaseTableSearch({
    supabase_project_id: reference.supabase_project_id,
    supabase_schema_name: reference.supabase_schema_name,
    supabase_table_name: reference.relation.referenced_table,
    q: {
      q_predicates: [
        {
          column: reference.relation.referenced_column,
          op: "eq",
          value: reference.fk_value,
        },
      ],
    },
  });

  return (
    <ReferencedRowLookupContext.Provider
      value={{
        result: data,
        isLoading,
      }}
    >
      {children}
    </ReferencedRowLookupContext.Provider>
  );
}

function useReferenced() {
  const context = React.useContext(ReferencedRowLookupContext);
  if (!context) {
    throw new Error(
      "useReferenceLookup must be used within a ReferenceLookupProvider"
    );
  }
  return context;
}

export default XSBReferencedRowLookupProvider;
export { useReferenced };
