"use client";

import React from "react";
import { XSBSQLForeignKeySearchInput } from "./xsb-sql-fk-search-input";
import { SQLLiteralInput } from "../sql-literal-input";

export function XSBSQLLiteralInput({
  value,
  onValueChange,
  config = { type: "text" },
  supabase,
  autoFocus,
}: React.ComponentProps<typeof SQLLiteralInput> & {
  supabase: {
    supabase_project_id: number;
    supabase_schema_name: string;
  };
}) {
  return (
    <SQLLiteralInput
      value={value}
      onValueChange={onValueChange}
      config={config}
      autoFocus={autoFocus}
      components={{
        fksearch: ({ value, onValueChange, relation, className }) => (
          <XSBSQLForeignKeySearchInput
            value={value}
            onValueChange={(value) => onValueChange?.(value)}
            relation={relation}
            supabase_project_id={supabase.supabase_project_id}
            supabase_schema_name={supabase.supabase_schema_name}
            className={className}
          />
        ),
      }}
    />
  );
}
