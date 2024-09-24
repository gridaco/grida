import { Button } from "@/components/ui/button";
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
import { XSBReferenceTableGrid } from "@/scaffolds/grid/reference-grid";
import { GridaXSupabase } from "@/types";
import useSWR from "swr";
import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import { SearchInput } from "@/components/extension/search-input";
import "react-data-grid/lib/styles.css";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GridDataXSBUnknown } from "@/scaffolds/grid-editor/grid-data-xsb-unknow";

export function ReferenceSearchPreview(
  props: React.ComponentProps<typeof SearchInput>
) {
  return <SearchInput {...props} />;
}

export function ReferenceSearch({
  field_id,
  ...props
}: React.ComponentProps<typeof SearchInput> & {
  field_id: string;
}) {
  const [open, setOpen] = useState(false);
  const [state] = useFormAgentState();
  const [value, setValue] = useState<string>("");
  const [localSearch, setLocalSearch] = useState<string>("");
  const [perpage, setPerPage] = useState<number>(50);

  const res = useSWR<
    GridaXSupabase.XSBSearchResult<
      any,
      {
        column: string;
      }
    >
  >(
    `/v1/session/${state.session_id}/field/${field_id}/search?per_page=${perpage}`,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );

  const { meta, data: _rows } = res.data ?? {};

  const {
    schema_name: schema,
    table_name: table,
    column: rowKey,
    table_schema,
  } = meta ?? {};

  const fulltable = [schema, table].filter(Boolean).join(".");

  const fuse = useMemo(() => {
    return new Fuse(_rows ?? [], {
      keys: Object.keys(table_schema?.properties ?? {}),
    });
  }, [_rows, table_schema]);

  const rows = useMemo(() => {
    if (!localSearch) {
      return _rows;
    }

    return fuse.search(localSearch).map((r) => r.item);
  }, [fuse, localSearch, _rows]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>
        <SearchInput
          {...props}
          // make sure to pass the value (after ...props)
          value={value}
        />
      </SheetTrigger>
      <SheetContent className="flex flex-col p-0 py-6 xl:w-[800px] xl:max-w-none sm:w-[500px] sm:max-w-none w-screen max-w-none">
        <SheetHeader className="px-6">
          <SheetTitle>Search Reference</SheetTitle>
          <SheetDescription>
            Select a record to reference from <code>{fulltable}</code>
          </SheetDescription>
        </SheetHeader>
        <div className="px-6">
          <SearchInput
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={`Search in ${rows?.length ?? 0} records`}
          />
        </div>
        <div className="flex-1">
          <div className="flex flex-col w-full h-full">
            <XSBReferenceTableGrid
              loading={!rows}
              tokens={localSearch ? [localSearch] : undefined}
              onSelected={(key, row) => {
                setValue(key);
                setOpen(false);
              }}
              rowKey={rowKey}
              columns={GridDataXSBUnknown.columns(table_schema, {
                sort: "unknown_table_column_priorities",
              })}
              rows={rows ?? []}
            />
            <footer className="w-full px-2 py-1 border-y">
              <div className="flex">
                <Select
                  value={perpage.toString()}
                  onValueChange={(v) => setPerPage(parseInt(v))}
                >
                  <SelectTrigger className="w-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="1000">1000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </footer>
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
