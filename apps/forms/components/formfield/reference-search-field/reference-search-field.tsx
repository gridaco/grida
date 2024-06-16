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

function SearchInput() {
  return (
    <div className="relative ml-auto flex-1 md:grow-0">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search..."
        className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[320px]"
      />
    </div>
  );
}

export function ReferenceSearchPreview() {
  return <SearchInput />;
}
export function ReferenceSearch({ id }: { id: string }) {
  const [state] = useFormAgentState();

  const res = useSWR<{
    data: {
      schema: string;
      table: string;
      users: GridaSupabase.SupabaseUser[];
    };
  }>(
    `/v1/session/${state.session_id}/field/${id}/search`,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );

  const fulltable = [res.data?.data?.schema, res.data?.data?.table]
    .filter(Boolean)
    .join(".");

  return (
    <Sheet>
      <SheetTrigger>
        <SearchInput />
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
              columns={Object.keys(
                GridaSupabase.SupabaseUserJsonSchema.properties
              ).map((key) => {
                const _ =
                  GridaSupabase.SupabaseUserJsonSchema.properties[
                    key as GridaSupabase.SupabaseUserColumn
                  ];

                return {
                  key: key,
                  name: key,
                };
              })}
              rows={
                res.data?.data?.users.map((user) => {
                  return Object.keys(user).reduce((acc, k) => {
                    const val = user[k as keyof GridaSupabase.SupabaseUser];
                    if (typeof val === "object") {
                      return { ...acc, [k]: JSON.stringify(val) };
                    }

                    return { ...acc, [k]: val };
                  }, {});
                }) ?? []
              }
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
