import React, { useState } from "react";
import { useFormAgentState } from "@/lib/formstate";
import { GridaXSupabase } from "@/types";
import { SearchInput } from "@/components/extension/search-input";
import { InputSkeleton } from "@/components/extension/input-skeleton";
import { FormsSecureXSBSQLForeignKeySearchInput } from "./xsb-secured";
import useSWR from "swr";

/**
 * Dummy search component for preview context
 * @returns
 */
export function ReferenceSearchPreview(
  props: React.ComponentProps<typeof SearchInput>
) {
  return <SearchInput {...props} />;
}

function useSearchMeta({
  session_id,
  field_id,
}: {
  session_id?: string;
  field_id: string;
}) {
  return useSWR<GridaXSupabase.Forms.XSBSearchMetaResult>(
    session_id
      ? `/v1/session/${session_id}/field/${field_id}/search/meta`
      : undefined,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );
}

export function ReferenceSearch({
  field_id,
  ...props
}: React.ComponentProps<typeof SearchInput> & {
  field_id: string;
}) {
  const [state] = useFormAgentState();
  const [value, setValue] = useState<unknown>();

  const { data, isLoading } = useSearchMeta({
    session_id: state.session_id,
    field_id,
  });

  if (isLoading) {
    return <InputSkeleton disabled {...props} />;
  }

  switch (data?.meta?.provider) {
    case "x-supabase": {
      return (
        <FormsSecureXSBSQLForeignKeySearchInput
          relation={{
            referenced_column: data.meta.referenced_column,
            referenced_table: data.meta.referenced_table,
          }}
          supabase_project_id={data.meta.supabase_project_id}
          supabase_schema_name={data.meta.schema_name}
          // [required] - for form validation
          {...props}
          // TODO: inspect me does the parent inteface need this?
          value={value as any}
          onValueChange={setValue}
        />
      );
      //
    }
    default: {
      return <SearchInput {...props} />;
    }
  }
}
