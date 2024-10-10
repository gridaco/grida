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
import { XSBReferenceTableGrid } from "@/scaffolds/grid/xsb-reference-grid";
import { GridaXSupabase } from "@/types";
import useSWR from "swr";
import { useState } from "react";
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
import * as GridLayout from "@/scaffolds/grid-editor/components/layout";
import { WorkbenchUI } from "@/components/workbench";
import toast from "react-hot-toast";
import { useLocalFuzzySearch } from "@/hooks/use-fuzzy-search";

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
    `/v1/session/${state.session_id}/field/${field_id}/search?perPage=${perpage}`,
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

  const result = useLocalFuzzySearch(localSearch, {
    data: _rows ?? [],
    keys: Object.keys(table_schema?.properties ?? {}),
  });

  const rows = result.map((r) => r.item);

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
        <GridLayout.Root>
          <GridLayout.Header>
            <GridLayout.HeaderLine>
              <div>
                <SearchInput
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  placeholder={`Search in ${rows?.length ?? 0} records`}
                />
              </div>
            </GridLayout.HeaderLine>
          </GridLayout.Header>
          <GridLayout.Content>
            <XSBReferenceTableGrid
              loading={!rows}
              tokens={localSearch ? [localSearch] : undefined}
              onRowDoubleClick={(row) => {
                if (rowKey) {
                  const key = row[rowKey];
                  setValue(key);
                  setOpen(false);
                } else {
                  toast.error(
                    "No row key found. This is a application error. Please contact support."
                  );
                }
              }}
              rowKey={rowKey}
              columns={GridDataXSBUnknown.columns(table_schema, {
                sort: "unknown_table_column_priorities",
              })}
              rows={rows ?? []}
            />
          </GridLayout.Content>
          <GridLayout.Footer>
            <div>
              <Select
                value={perpage.toString()}
                onValueChange={(v) => setPerPage(parseInt(v))}
              >
                <SelectTrigger
                  className={WorkbenchUI.selectVariants({
                    variant: "trigger",
                    size: "sm",
                  })}
                >
                  <SelectValue placeholder="rows" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={10 + ""}>10 rows</SelectItem>
                  <SelectItem value={100 + ""}>100 rows</SelectItem>
                  <SelectItem value={500 + ""}>500 rows</SelectItem>
                  <SelectItem value={1000 + ""}>1000 rows</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </GridLayout.Footer>
        </GridLayout.Root>
        <hr />
        <SheetFooter className="px-6">
          <SheetClose>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
