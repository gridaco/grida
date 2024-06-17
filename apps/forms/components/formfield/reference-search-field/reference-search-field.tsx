import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useFormAgentState } from "@/lib/formstate";
import { ReferenceTableGrid } from "@/scaffolds/grid/reference-grid";
import { GridaSupabase } from "@/types";
import { Search } from "lucide-react";
import useSWR from "swr";
import "react-data-grid/lib/styles.css";
import { useState } from "react";

/**
 * general & common priorities for columns order (only for auth.users table)
 */
const priorities = ["id", "email", "name", "username"];

const sort_by_priorities = (a: string, b: string) => {
  const _a = priorities.indexOf(a);
  const _b = priorities.indexOf(b);
  if (_a === -1 && _b === -1) {
    return a.localeCompare(b);
  }

  if (_a === -1) {
    return 1;
  }

  if (_b === -1) {
    return -1;
  }

  return _a - _b;
};

function SearchInput(props: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative ml-auto flex-1 md:grow-0">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search"
        className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[320px]"
        {...props}
      />
    </div>
  );
}

export function ReferenceSearchPreview(
  props: React.ComponentProps<typeof SearchInput>
) {
  return <SearchInput {...props} />;
}

type SearchRes = {
  schema_name: string;
  table_name: string;
  table_schema: GridaSupabase.SupabaseTable["sb_table_schema"];
  column: string;
  rows: Record<string, any>[];
};

export function ReferenceSearch({
  field_id,
  ...props
}: React.ComponentProps<typeof SearchInput> & {
  field_id: string;
}) {
  const [open, setOpen] = useState(false);
  const [state] = useFormAgentState();
  const [value, setValue] = useState<string>("");

  const res = useSWR<{
    data: SearchRes;
  }>(
    `/v1/session/${state.session_id}/field/${field_id}/search`,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );

  const {
    schema_name: schema,
    table_name: table,
    column: rowKey,
    rows,
    table_schema,
  } = res.data?.data ?? {};
  const fulltable = [schema, table].filter(Boolean).join(".");

  const is_auth_users_table = schema === "auth" && table === "users";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>
        <SearchInput value={value} {...props} />
      </SheetTrigger>
      <SheetContent className="flex flex-col p-0 py-6 xl:w-[800px] xl:max-w-none sm:w-[500px] sm:max-w-none w-screen max-w-none">
        <SheetHeader className="px-6">
          <SheetTitle>Search Reference</SheetTitle>
          <SheetDescription>
            Select a record to reference from <code>{fulltable}</code>
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1">
          <div className="flex flex-col w-full h-full">
            <ReferenceTableGrid
              onSelected={(key, row) => {
                setValue(key);
                setOpen(false);
              }}
              rowKey={rowKey}
              columns={Object.keys(table_schema?.properties ?? {})
                .sort(sort_by_priorities)
                .map((key) => {
                  const _ = (table_schema?.properties as any)[key];
                  return {
                    key: key,
                    name: key,
                    type: _.type,
                    format: _.format,
                  };
                })}
              rows={rows ?? []}
            />
          </div>
        </div>
        <SheetFooter className="px-6">
          <SheetClose>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const _auth_user_columns = Object.keys(
  GridaSupabase.SupabaseUserJsonSchema.properties
).map((key) => {
  const _ =
    GridaSupabase.SupabaseUserJsonSchema.properties[
      key as GridaSupabase.SupabaseUserColumn
    ];

  return {
    key: key,
    name: key,
    type: _.type,
    format: _.format,
  };
});
