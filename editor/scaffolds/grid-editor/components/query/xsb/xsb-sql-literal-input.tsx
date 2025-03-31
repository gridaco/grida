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
  const fksearchComponent = React.useMemo(() => {
    return ({
      value,
      onValueChange,
      relation,
      className,
    }: {
      value: any;
      onValueChange: (value: any) => void;
      relation: any;
      className?: string;
    }) => (
      <XSBSQLForeignKeySearchInput
        value={value}
        onValueChange={onValueChange}
        relation={relation}
        supabase_project_id={supabase.supabase_project_id}
        supabase_schema_name={supabase.supabase_schema_name}
        className={className}
      />
    );
  }, [supabase.supabase_project_id, supabase.supabase_schema_name]);

  return (
    <SQLLiteralInput
      value={value}
      onValueChange={onValueChange}
      config={config}
      autoFocus={autoFocus}
      components={{ fksearch: fksearchComponent }}
    />
  );
}
