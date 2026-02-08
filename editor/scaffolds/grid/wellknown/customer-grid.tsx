"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import DataGrid, {
  Column,
  RenderCellProps,
  RenderHeaderCellProps,
  useRowSelection,
} from "react-data-grid";
import {
  AvatarIcon,
  CalendarIcon,
  Cross2Icon,
  EnvelopeClosedIcon,
} from "@radix-ui/react-icons";
import { PhoneIcon, TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { DGCustomerRow } from "../types";
import { EmptyRowsRenderer } from "../grid-empty-state";
import { mask } from "../grid-text-mask";
import Highlight from "@/components/highlight";
import { CellRoot } from "../cells";
import { SelectColumn } from "../columns";
import {
  StandaloneDataGridStateProvider,
  useCellRootProps,
} from "../providers";
import "../grid.css";
import { DataFormat } from "@/scaffolds/data-format";
import {
  GridQueryLimitSelect,
  GridRefreshButton,
  DataQueryTextSearch,
  GridQueryCount,
  GridQueryPaginationControl,
  GridLoadingProgressLine,
  DataQueryPredicatesMenu,
  DataQueryPredicatesMenuTriggerButton,
  DataQueryOrderByMenu,
  DataQueryOrderbyMenuTriggerButton,
} from "@/scaffolds/grid-editor/components";
import { TableQueryChips } from "@/scaffolds/grid-editor/components/query/query-chips";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  fetchCustomers,
  fetchCustomerIds,
} from "@/scaffolds/platform/customer/use-customer-feed";
import { useTableSpaceInstance } from "@/scaffolds/data-table";
import { createBrowserCIAMClient } from "@/lib/supabase/client";
import {
  DataPlatformProvider,
  PredicateConfigProvider,
  SchemaNameProvider,
  StandaloneDataQueryProvider,
  TableDefinitionProvider,
  type PredicateConfig,
} from "@/scaffolds/data-query";
import { useProject, useTags } from "@/scaffolds/workspace";
import { Platform } from "@/lib/platform";
import { txt_n_plural } from "@/utils/plural";
import type { SchemaDataQueryConsumerReturnType } from "@/scaffolds/data-query";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CustomerTableContextValue {
  tablespace: ReturnType<
    typeof useTableSpaceInstance<Platform.Customer.CustomerWithTags>
  > &
    SchemaDataQueryConsumerReturnType;
  selection: Set<string>;
  setSelection: (s: Set<string>) => void;
  clearSelection: () => void;
  hasSelection: boolean;
}

const CustomerTableContext = createContext<CustomerTableContextValue | null>(
  null
);

export function useCustomerTable() {
  const ctx = useContext(CustomerTableContext);
  if (!ctx) {
    throw new Error(
      "useCustomerTable must be used within a CustomerTable.Provider"
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

type SubscriptionDisposer = () => void;

interface ProviderProps {
  children: React.ReactNode;
  /** Enable realtime subscription (default false) */
  realtime?: boolean;
  /** Optional realtime subscriber factory (only used when realtime=true) */
  subscriber?: (callbacks: {
    onInsert?: (data: Platform.Customer.CustomerWithTags) => void;
    onUpdate?: (data: Platform.Customer.CustomerWithTags) => void;
    onDelete?: (
      data: Platform.Customer.CustomerWithTags | Record<string, unknown>
    ) => void;
  }) => SubscriptionDisposer;
}

function Provider({ children, realtime = false, subscriber }: ProviderProps) {
  return (
    <StandaloneDataQueryProvider>
      <ProviderInner realtime={realtime} subscriber={subscriber}>
        {children}
      </ProviderInner>
    </StandaloneDataQueryProvider>
  );
}

function ProviderInner({ children, realtime, subscriber }: ProviderProps) {
  const project = useProject();
  const project_id = project.id;
  const ciamClient = useMemo(() => createBrowserCIAMClient(), []);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const { tags: projectTags } = useTags();

  const tagOptions = useMemo(
    () => projectTags.map((t) => ({ value: t.name, color: t.color })),
    [projectTags]
  );

  const predicateConfig = useMemo<PredicateConfig>(
    () => ({
      getEnumOptions: (meta) => {
        if (meta.name === "tags" && meta.array && meta.scalar_format === "text")
          return tagOptions;
        return undefined;
      },
      getDefaultPredicate: (meta) => {
        if (meta.name === "tags" && meta.array && meta.scalar_format === "text")
          return { op: "ov" };
        return undefined;
      },
    }),
    [tagOptions]
  );

  const tablespace = useTableSpaceInstance<Platform.Customer.CustomerWithTags>({
    identifier: "uid",
    readonly: !realtime,
    realtime: !!realtime,
    fetcher: (q) => fetchCustomers(ciamClient, project_id, q),
    subscriber,
  });

  const clearSelection = useCallback(() => setSelection(new Set()), []);
  const hasSelection = selection.size > 0;

  const value = useMemo<CustomerTableContextValue>(
    () => ({
      tablespace,
      selection,
      setSelection,
      clearSelection,
      hasSelection,
    }),
    [tablespace, selection, clearSelection, hasSelection]
  );

  return (
    <DataPlatformProvider platform={{ provider: "grida" }}>
      <PredicateConfigProvider config={predicateConfig}>
        <SchemaNameProvider schema={undefined}>
          <TableDefinitionProvider definition={Platform.Customer.TABLE}>
            <CustomerTableContext.Provider value={value}>
              {children}
            </CustomerTableContext.Provider>
          </TableDefinitionProvider>
        </SchemaNameProvider>
      </PredicateConfigProvider>
    </DataPlatformProvider>
  );
}

// ---------------------------------------------------------------------------
// Toolbar (filters: predicates + orderby + text search)
// ---------------------------------------------------------------------------

function Toolbar() {
  const { tablespace } = useCustomerTable();
  return (
    <div className="flex gap-1 items-center">
      <DataQueryPredicatesMenu {...tablespace}>
        <DataQueryPredicatesMenuTriggerButton
          active={tablespace.isPredicatesSet}
        />
      </DataQueryPredicatesMenu>
      <DataQueryOrderByMenu {...tablespace}>
        <DataQueryOrderbyMenuTriggerButton active={tablespace.isOrderbySet} />
      </DataQueryOrderByMenu>
      <DataQueryTextSearch
        placeholder="Search customers"
        onValueChange={(v) => {
          if (v.trim()) {
            tablespace.onTextSearch(
              Platform.Customer.TABLE_SEARCH_TEXT,
              v.trim()
            );
          } else {
            tablespace.onTextSearchClear();
          }
        }}
        debounce={500}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SelectionBar (clear + count + separator + SelectAll + children)
// ---------------------------------------------------------------------------

function SelectionBar({ children }: { children?: React.ReactNode }) {
  const { selection, clearSelection } = useCustomerTable();
  return (
    <div className="flex gap-2 items-center">
      <div className="flex items-center gap-1.5">
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          onClick={clearSelection}
        >
          <Cross2Icon />
        </Button>
        <span className="text-sm text-muted-foreground">
          {txt_n_plural(selection.size, "customer")} selected
        </span>
      </div>
      {children && (
        <>
          <div className="border-r h-6" />
          {children}
        </>
      )}
      <div className="border-r h-6" />
      <SelectAllButton />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SelectAllButton
// ---------------------------------------------------------------------------

function SelectAllButton() {
  const { tablespace, selection, setSelection } = useCustomerTable();
  const project = useProject();
  const ciamClient = useMemo(() => createBrowserCIAMClient(), []);
  const [loading, setLoading] = useState(false);

  const pageRowIds = useMemo(
    () => tablespace.stream?.map((r) => r.uid) ?? [],
    [tablespace.stream]
  );

  const allPageSelected =
    pageRowIds.length > 0 && pageRowIds.every((id) => selection.has(id));

  const allTotalSelected =
    tablespace.estimated_count != null &&
    tablespace.estimated_count > 0 &&
    selection.size >= tablespace.estimated_count;

  const hasMore =
    tablespace.estimated_count != null &&
    tablespace.estimated_count > pageRowIds.length;

  if (!allPageSelected || !hasMore || allTotalSelected) return null;

  const handleClick = async () => {
    setLoading(true);
    const { data, error } = await fetchCustomerIds(ciamClient, project.id, {
      q_predicates: tablespace.predicates,
      q_text_search: tablespace.q_text_search,
    });
    setLoading(false);

    if (error || !data) {
      console.error("Failed to fetch customer IDs", error);
      return;
    }

    setSelection(new Set(data.map((c) => c.uid)));
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleClick} disabled={loading}>
      {loading && <Spinner />}
      Select all {tablespace.estimated_count?.toLocaleString() ?? ""} customers
    </Button>
  );
}

// ---------------------------------------------------------------------------
// FilterChips
// ---------------------------------------------------------------------------

function FilterChips() {
  const { tablespace } = useCustomerTable();

  if (!tablespace.isPredicatesSet && !tablespace.isOrderbySet) return null;

  return (
    <div className="border-b px-2 min-h-9 flex items-center">
      <ScrollArea>
        <ScrollBar orientation="horizontal" className="invisible" />
        <div className="px-2">
          <TableQueryChips {...tablespace} />
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoadingLine
// ---------------------------------------------------------------------------

function LoadingLine() {
  const { tablespace } = useCustomerTable();
  return <GridLoadingProgressLine loading={tablespace.loading} />;
}

// ---------------------------------------------------------------------------
// Grid (composite -- reads from context)
// ---------------------------------------------------------------------------

function Grid(
  props: Omit<
    CustomerGridProps,
    | "rows"
    | "loading"
    | "tokens"
    | "selectedRows"
    | "onSelectedRowsChange"
    | "estimatedCount"
  >
) {
  const { tablespace, selection, setSelection } = useCustomerTable();
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <CustomerGrid
        loading={tablespace.loading}
        tokens={tablespace.q_text_search ? [tablespace.q_text_search.query] : []}
        selectedRows={selection}
        onSelectedRowsChange={setSelection}
        rows={tablespace.stream || []}
        estimatedCount={tablespace.estimated_count}
        {...props}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer({ children }: { children?: React.ReactNode }) {
  const { tablespace } = useCustomerTable();
  return (
    <>
      <GridQueryPaginationControl {...tablespace} />
      <GridQueryLimitSelect
        value={tablespace.limit}
        onValueChange={tablespace.onLimit}
      />
      <GridQueryCount count={tablespace.estimated_count} keyword="customer" />
      <GridRefreshButton
        refreshing={tablespace.loading}
        onRefreshClick={tablespace.onRefresh}
      />
      {children}
    </>
  );
}

// ---------------------------------------------------------------------------
// CustomerGrid (low-level data grid -- usable standalone or via Grid composite)
// ---------------------------------------------------------------------------

const column_keys: (Platform.Customer.Property & {
  key: keyof DGCustomerRow;
  name: string;
  width?: number;
  frozen?: boolean;
  sensitive?: boolean;
})[] = [
  {
    key: "name",
    name: "Name",
    frozen: true,
    sensitive: true,
    width: 200,
    ...Platform.Customer.properties["name"],
  },
  {
    key: "email",
    name: "Email",
    sensitive: true,
    ...Platform.Customer.properties["email"],
  },
  {
    key: "phone",
    name: "Phone",
    sensitive: true,
    ...Platform.Customer.properties["phone"],
  },
  {
    key: "tags",
    name: "Tags",
    sensitive: false,
    ...Platform.Customer.properties["tags"],
  },
  {
    key: "created_at",
    name: "Created",
    sensitive: false,
    ...Platform.Customer.properties["created_at"],
  },
  {
    key: "last_seen_at",
    name: "Last Seen",
    sensitive: false,
    ...Platform.Customer.properties["last_seen_at"],
  },
];

interface CustomerGridProps {
  rows: DGCustomerRow[];
  tokens?: string[];
  masked?: boolean;
  datetz?: DataFormat.DateTZ;
  dateformat?: DataFormat.DateFormat;
  loading?: boolean;
  onCellDoubleClick?: (row: DGCustomerRow, column: string) => void;
  onSelectedRowsChange?: (rows: Set<string>) => void;
  selectedRows?: ReadonlySet<string>;
  /**
   * When provided, the header checkbox shows indeterminate when all page
   * rows are selected but the total matching count is larger.
   */
  estimatedCount?: number | null;
}

export function CustomerGrid({
  rows: _rows,
  tokens,
  masked,
  loading,
  dateformat = "datetime",
  datetz,
  onCellDoubleClick,
  onSelectedRowsChange,
  selectedRows,
  estimatedCount,
}: CustomerGridProps) {
  const columns = column_keys.map(
    (col) =>
      ({
        key: col.key,
        name: col.name,
        resizable: true,
        draggable: true,
        editable: false,
        frozen: col.frozen,
        width: col.width,
        renderHeaderCell: DataHeaderCell,
        renderCell: ({ row }: RenderCellProps<any>) => {
          const val = row[col.key as keyof DGCustomerRow];

          if (col.type === "array") {
            return (
              <CellRoot className="flex items-center gap-1">
                {(val as string[] | undefined)?.map((v) => (
                  <Badge key={v} variant="outline">
                    {v}
                  </Badge>
                ))}
              </CellRoot>
            );
          } else {
            const nonnull = val ?? "—";
            let display = nonnull.toString();
            if (masked && col.sensitive) {
              display = mask(display);
            } else if (col.format === "timestamptz") {
              display = DataFormat.fmtdate(display, dateformat, datetz);
            }
            return (
              <CellRoot>
                <Highlight
                  text={display}
                  tokens={tokens}
                  highlightClassName="bg-foreground text-background"
                />
              </CellRoot>
            );
          }
        },
      }) as Column<any>
  );

  // Custom header cell supporting indeterminate when estimatedCount is provided.
  const selectColumn =
    estimatedCount != null
      ? {
          ...SelectColumn,
          renderHeaderCell: (props: RenderHeaderCellProps<unknown>) => {
            const { column } = props;
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const [, onRowSelectionChange] = useRowSelection();
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const rootprops = useCellRootProps(-1, column.key);

            let checked: CheckedState = false;
            if (selectedRows && selectedRows.size > 0) {
              if (selectedRows.size >= estimatedCount) {
                checked = true;
              } else {
                checked = "indeterminate";
              }
            }

            return (
              <CellRoot {...rootprops} className="border-t-0">
                <Checkbox
                  aria-label="Select All"
                  tabIndex={props.tabIndex}
                  className="rdg-row__select-column__select-action"
                  checked={checked}
                  onCheckedChange={() => {
                    if (checked === false) {
                      onRowSelectionChange({
                        type: "HEADER",
                        checked: true,
                      });
                    } else {
                      onSelectedRowsChange?.(new Set());
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                />
              </CellRoot>
            );
          },
        }
      : SelectColumn;

  columns.unshift(selectColumn);

  const rows: DGCustomerRow[] = _rows.map((row) => {
    return Object.keys(row).reduce((acc, k) => {
      const val = row[k as keyof DGCustomerRow];

      if (Array.isArray(val)) {
        return { ...acc, [k]: val };
      }

      if (val !== null && typeof val === "object") {
        return { ...acc, [k]: JSON.stringify(val) };
      }

      return { ...acc, [k]: val };
    }, {}) as DGCustomerRow;
  });

  return (
    <StandaloneDataGridStateProvider>
      <DataGrid<DGCustomerRow>
        className="grow select-none text-xs text-foreground/80"
        columns={columns}
        selectedRows={selectedRows}
        onSelectedRowsChange={(rows) => {
          onSelectedRowsChange?.(rows as Set<string>);
        }}
        rows={rows}
        renderers={{ noRowsFallback: <EmptyRowsRenderer loading={loading} /> }}
        rowKeyGetter={(row) => (row as DGCustomerRow)["uid"]}
        onCellDoubleClick={({ row, column }) => {
          onCellDoubleClick?.(row, column.key);
        }}
        rowHeight={32}
        headerRowHeight={36}
      />
    </StandaloneDataGridStateProvider>
  );
}

function DataHeaderCell({ column }: RenderHeaderCellProps<any>) {
  const { name, key } = column;

  return (
    <CellRoot className="flex items-center gap-1.5">
      <CustomerPropertyIcon property={key as any} className="size-3.5" />
      <span className="font-normal">{name}</span>
    </CellRoot>
  );
}

function CustomerPropertyIcon({
  property,
  className,
}: {
  property: keyof DGCustomerRow;
  className?: string;
}) {
  const iconProps = { className };
  switch (property) {
    case "name":
      return <AvatarIcon {...iconProps} />;
    case "email":
      return <EnvelopeClosedIcon {...iconProps} />;
    case "phone":
      return <PhoneIcon {...iconProps} />;
    case "tags":
      return <TagIcon {...iconProps} />;
    case "created_at":
    case "last_seen_at":
      return <CalendarIcon {...iconProps} />;
    default:
      return <></>;
  }
}

// ---------------------------------------------------------------------------
// Namespace export
// ---------------------------------------------------------------------------

export const CustomerTable = {
  Provider,
  Toolbar,
  SelectionBar,
  SelectAllButton,
  FilterChips,
  LoadingLine,
  Grid,
  Footer,
};
