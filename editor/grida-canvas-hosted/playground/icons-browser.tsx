"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui-editor/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui-editor/progress";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CaretDownIcon, DotIcon } from "@radix-ui/react-icons";
import { CheckIcon, Search as SearchIcon } from "lucide-react";
import { cn } from "@/components/lib/utils";

export type IconsBrowserItem = {
  id: string;
  name: string;
  download: string;
  tags?: string[];
  vendor?: string;
};

type IconVendor = {
  id: string;
  name: string;
  vendor: IconVendorId;
  count: number;
  categories: GridaIconsLibraryCategory[];
  variants: Record<string, VendorVariantSpec>;
};

type VendorVariantSpec = {
  title: string;
  default: string;
  enum: string[];
};

const ICONS_API_URL = "https://icons.grida.co/api";
const ICONS_VENDORS_API_URL = "https://icons.grida.co/api/vendors";
const COLUMN_COUNT = 5;
const GRID_GAP_PX = 12; // tailwind gap-3
const GRID_PADDING_X_PX = 4; // tailwind px-1 per side
const ALLOWED_CATEGORY: GridaIconsLibraryCategory =
  "grida://library/categories/icons-ui";
type IconVendorId = string;
const ANY_VARIANT = "__any";
type IconFilters = {
  vendor: IconVendorId | null;
  variants: Record<string, string>;
};

export type GridaIconsLibraryCategory =
  | "grida://library/categories/logos"
  | "grida://library/categories/icons-ui"
  | (string & {});

const toTitleCase = (value: string) => {
  return value
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

function buildVariants(
  v?: Record<
    string,
    {
      title?: string;
      default?: string;
      enum?: string[];
    }
  >
): Record<string, VendorVariantSpec> {
  if (!v) return {};
  const entries = Object.entries(v).flatMap(([key, spec]) => {
    if (!spec?.enum || !Array.isArray(spec.enum) || spec.enum.length === 0) {
      return [];
    }
    return [
      [
        key,
        {
          title: spec.title ?? key,
          default: spec.default ?? spec.enum[0],
          enum: spec.enum,
        } satisfies VendorVariantSpec,
      ] as const,
    ];
  });
  return Object.fromEntries(entries);
}

const getDefaultVariants = (vendor?: IconVendor): Record<string, string> => {
  if (!vendor) return {};
  return Object.fromEntries(
    Object.entries(vendor.variants).map(([key]) => [key, ANY_VARIANT])
  );
};

export type IconsBrowserProps = {
  onInsert?: (icon: IconsBrowserItem) => Promise<void> | void;
};

function useIcons() {
  const [icons, setIcons] = useState<IconsBrowserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [vendors, setVendors] = useState<IconVendor[]>([]);
  const [filters, setFilters] = useState<IconFilters>({
    vendor: null,
    variants: {},
  });
  const [vendorsLoaded, setVendorsLoaded] = useState(false);
  const currentVendor = useMemo(
    () => vendors.find((v) => v.vendor === filters.vendor) ?? null,
    [vendors, filters.vendor]
  );

  const fetchIcons = useCallback(async () => {
    if (!vendorsLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.vendor) {
        params.set("vendor", filters.vendor);
      }
      Object.entries(filters.variants).forEach(([key, value]) => {
        if (value && value !== ANY_VARIANT) {
          params.set(`variant:${key}`, value);
        }
      });
      const url =
        params.size > 0
          ? `${ICONS_API_URL}?${params.toString()}`
          : ICONS_API_URL;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load icons (${res.status})`);
      }
      const payload = await res.json();
      const rawList: any[] =
        (Array.isArray(payload) && payload) ||
        payload?.items ||
        payload?.icons ||
        payload?.data ||
        [];
      const allowedVendors = new Set(
        vendors
          .filter((v) => v.categories.includes(ALLOWED_CATEGORY))
          .map((v) => v.vendor)
      );
      const hasAllowed = allowedVendors.size > 0;
      const normalized = rawList
        .map((item, index) => {
          const download = item?.download;
          if (!download) return null;
          const vendor = item?.vendor || item?.host || item?.family || "";
          if (hasAllowed && !allowedVendors.has(vendor)) return null;
          const baseName =
            item?.name ||
            item?.title ||
            item?.id ||
            item?.family ||
            `icon-${index}`;
          const variant =
            item?.variant ||
            item?.properties?.style ||
            item?.style ||
            item?.properties?.variant;
          const size = item?.properties?.size || item?.size;
          const friendlyBase = toTitleCase(baseName);
          const metaParts = [variant, size ? `${size}px` : null]
            .filter(Boolean)
            .join(", ");
          const name =
            metaParts.length > 0
              ? `${friendlyBase} (${metaParts})`
              : friendlyBase;
          const tags = Array.isArray(item?.tags)
            ? item.tags
            : Array.isArray(item?.keywords)
              ? item.keywords
              : [];
          return {
            id: String(
              [vendor, baseName, variant, size].filter(Boolean).join(":") ||
                item?.id ||
                index
            ),
            name: String(name),
            download: String(download),
            tags: [
              vendor,
              variant,
              size ? `${size}px` : null,
              ...tags.map((t: any) => String(t)),
            ].filter(Boolean) as string[],
            vendor,
          } satisfies IconsBrowserItem;
        })
        .filter(Boolean) as IconsBrowserItem[];
      setIcons(normalized);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load icons");
    } finally {
      setLoading(false);
    }
  }, [filters, vendorsLoaded, vendors]);

  useEffect(() => {
    void fetchIcons();
  }, [fetchIcons, vendorsLoaded]);

  useEffect(() => {
    const loadVendors = async () => {
      try {
        const res = await fetch(ICONS_VENDORS_API_URL, {
          cache: "force-cache",
        });
        if (!res.ok) throw new Error(`Failed to load vendors (${res.status})`);
        const payload = await res.json();
        const list: IconVendor[] =
          (payload?.items as any[])?.flatMap((v) => {
            const rawVendor = v?.vendor ?? v?.id ?? "";
            if (!rawVendor) return [];
            return [
              {
                id: v?.id ?? rawVendor,
                name: v?.name ?? rawVendor,
                vendor: rawVendor as IconVendorId,
                count: Number(v?.count ?? 0),
                categories: Array.isArray(v?.categories)
                  ? (v.categories as GridaIconsLibraryCategory[])
                  : [],
                variants: buildVariants(v?.variants),
              },
            ];
          }) ?? [];
        const filtered = list.filter(
          (v) => v.id && v.categories.includes(ALLOWED_CATEGORY)
        );
        setVendors(filtered);
        setFilters((prev) => {
          const nextVendor =
            prev.vendor && filtered.some((v) => v.vendor === prev.vendor)
              ? prev.vendor
              : null;
          const nextVendorObj =
            filtered.find((v) => v.vendor === nextVendor) ?? undefined;
          return {
            vendor: nextVendor,
            variants: getDefaultVariants(nextVendorObj),
          };
        });
        setVendorsLoaded(true);
      } catch (e) {
        console.warn("Failed to load icon vendors", e);
      }
    };
    void loadVendors();
  }, []);

  const filteredIcons = useMemo(() => {
    const base = filters.vendor
      ? icons.filter((i) => i.vendor === filters.vendor)
      : icons;
    if (!query) return base;
    const term = query.toLowerCase();
    return base.filter(
      (icon) =>
        icon.name.toLowerCase().includes(term) ||
        icon.tags?.some((tag) => tag.toLowerCase().includes(term))
    );
  }, [icons, query, filters.vendor]);

  const selectVendor = useCallback(
    (vendor: IconVendorId | null) => {
      setLoading(true);
      setError(null);
      const vendorObj = vendors.find((v) => v.vendor === vendor);
      setFilters({
        vendor,
        variants: getDefaultVariants(vendorObj),
      });
    },
    [vendors]
  );

  const selectVariant = useCallback((key: string, value: string) => {
    setLoading(true);
    setError(null);
    setFilters((prev) => ({
      ...prev,
      variants: { ...prev.variants, [key]: value || ANY_VARIANT },
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setLoading(true);
    setError(null);
    setFilters((prev) => ({
      vendor: prev.vendor,
      variants: getDefaultVariants(
        vendors.find((v) => v.vendor === prev.vendor) ?? undefined
      ),
    }));
  }, [vendors]);

  return {
    icons,
    filteredIcons,
    loading,
    error,
    query,
    setQuery,
    vendors,
    vendorsLoaded,
    selectedVendor: filters.vendor,
    selectedVariants: filters.variants,
    currentVendor,
    selectVendor,
    selectVariant,
    resetFilters,
  };
}

type VariantFilterChipProps = {
  variantKey: string;
  spec: VendorVariantSpec;
  value?: string;
  onChange: (value: string) => void;
};

function VariantFilterChip({
  variantKey,
  spec,
  value,
  onChange,
}: VariantFilterChipProps) {
  const currentValue = value ?? ANY_VARIANT;
  const isActive = currentValue !== ANY_VARIANT;
  const [open, setOpen] = useState(false);

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "h-7 inline-flex items-center gap-1 rounded-full ps-2 pe-1 text-xs font-normal whitespace-nowrap bg-background/60 cursor-pointer",
            isActive
              ? "border-workbench-accent-sky text-workbench-accent-sky bg-workbench-accent-sky/10"
              : "border-input text-muted-foreground"
          )}
        >
          <span>{spec.title}</span>
          {isActive ? (
            <>
              <DotIcon className="inline size-3" />
              <span>{currentValue}</span>
            </>
          ) : null}
          <CaretDownIcon className="size-3" />
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="p-0 min-w-[160px]" align="start">
        <Command>
          <CommandInput placeholder={`Filter ${spec.title ?? variantKey}...`} />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={ANY_VARIANT}
                onSelect={() => handleSelect(ANY_VARIANT)}
              >
                <CheckIcon
                  className={cn(
                    "mr-2 h-4 w-4",
                    currentValue === ANY_VARIANT ? "opacity-100" : "opacity-0"
                  )}
                />
                Any
              </CommandItem>
              {spec.enum.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => handleSelect(opt)}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      currentValue === opt ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type IconGridCellProps = {
  icon: IconsBrowserItem;
  cellSize: number;
  onClick: (icon: IconsBrowserItem) => void;
};

const IconGridCell = ({ icon, cellSize, onClick }: IconGridCellProps) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <Tooltip key={icon.id}>
      <div className="h-full">
        <TooltipTrigger asChild>
          <button
            className="relative flex aspect-square w-full flex-col items-center justify-center gap-1 p-1.5 hover:bg-muted transition text-foreground/80 rounded-sm"
            onClick={() => {
              void onClick(icon);
            }}
            style={{ maxHeight: cellSize }}
          >
            <div
              className="pointer-events-none absolute inset-1 rounded-sm bg-muted/40 animate-pulse"
              style={{ opacity: loaded ? 0 : 1 }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={icon.download}
              alt={icon.name}
              loading="lazy"
              className="relative z-10 h-6 w-6 object-contain dark:invert transition-opacity duration-150"
              style={{ opacity: loaded ? 1 : 0 }}
              onLoad={() => setLoaded(true)}
            />
          </button>
        </TooltipTrigger>
      </div>
      <TooltipContent
        side="bottom"
        sideOffset={0}
        className="pointer-events-none"
      >
        {icon.name} ({icon.tags?.[0] ?? "icon"})
      </TooltipContent>
    </Tooltip>
  );
};

export function IconsBrowser({ onInsert }: IconsBrowserProps) {
  const {
    filteredIcons,
    loading,
    error,
    query,
    setQuery,
    vendors,
    vendorsLoaded,
    selectedVendor,
    selectedVariants,
    currentVendor,
    selectVendor,
    selectVariant,
    resetFilters,
  } = useIcons();
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const [cellSize, setCellSize] = useState(100);
  const hasActiveVariantFilter = useMemo(() => {
    if (!currentVendor) return false;
    return Object.entries(currentVendor.variants).some(([key]) => {
      const val = selectedVariants[key];
      return val && val !== ANY_VARIANT;
    });
  }, [currentVendor, selectedVariants]);

  const handleInsert = useCallback(
    async (icon: IconsBrowserItem) => {
      if (!onInsert) return;
      await onInsert(icon);
    },
    [onInsert]
  );

  useEffect(() => {
    const el = scrollParentRef.current;
    if (!el) return;

    const updateCellSize = () => {
      const width = el.clientWidth;
      if (!width) return;
      const availableWidth =
        width - GRID_PADDING_X_PX * 2 - GRID_GAP_PX * (COLUMN_COUNT - 1);
      const next = availableWidth > 0 ? availableWidth / COLUMN_COUNT : 100;
      setCellSize(next);
    };

    updateCellSize();
    const observer = new ResizeObserver(updateCellSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rowHeight = useMemo(
    () => Math.max(cellSize + GRID_GAP_PX, 60),
    [cellSize]
  );

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(filteredIcons.length / COLUMN_COUNT),
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  });

  return (
    <div className="text-sm pointer-events-auto bg-background h-full flex flex-col">
      <header className="space-y-2 border-b">
        <div className="flex gap-2 pt-2 px-2">
          <InputGroup className="h-7">
            <InputGroupAddon align="inline-start" className="ps-2">
              <SearchIcon className="size-3 " />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search icons"
              className="!text-xs placeholder:text-xs"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </InputGroup>
        </div>
        <div className="w-full space-y-1 pb-2">
          {vendors.length > 0 && (
            <div className="relative">
              <ScrollArea type="scroll" className="w-full">
                <div className="flex gap-1 px-2">
                  <button
                    className={`rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap ${
                      selectedVendor === null
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground/80 hover:bg-muted"
                    }`}
                    onClick={() => selectVendor(null)}
                  >
                    All
                  </button>
                  {vendors.map((vendor) => (
                    <button
                      key={vendor.id}
                      className={`h-7 rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap ${
                        selectedVendor === vendor.vendor
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground/80 hover:bg-muted"
                      }`}
                      onClick={() => selectVendor(vendor.vendor)}
                    >
                      {vendor.name} ({vendor.count})
                    </button>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" className="hidden" />
              </ScrollArea>
              <div className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-background to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-2 bg-gradient-to-l from-background to-transparent" />
            </div>
          )}
          {currentVendor && Object.keys(currentVendor.variants).length > 0 && (
            <div className="flex items-center gap-2 px-2">
              <div className="flex-1 overflow-x-auto overflow-y-visible">
                <div className="flex gap-1 pr-1">
                  {Object.entries(currentVendor.variants).map(([key, spec]) => (
                    <VariantFilterChip
                      key={key}
                      variantKey={key}
                      spec={spec}
                      value={selectedVariants[key]}
                      onChange={(val) => selectVariant(key, val)}
                    />
                  ))}
                </div>
              </div>
              {hasActiveVariantFilter && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="shrink-0 text-xs"
                  onClick={resetFilters}
                  disabled={!vendorsLoaded}
                >
                  Reset
                </Button>
              )}
            </div>
          )}
        </div>
      </header>
      <div className="w-full overflow-visible" style={{ height: 0 }}>
        {loading && <Progress className="h-px" indeterminate />}
      </div>
      {error && (
        <div className="text-xs text-destructive">Failed to load: {error}</div>
      )}
      {!loading && vendorsLoaded && !error && filteredIcons.length === 0 && (
        <div className="text-xs text-muted-foreground p-4">
          No icons found. Try another search.
        </div>
      )}
      <div
        ref={scrollParentRef}
        className="relative w-full flex-1 min-h-0 overflow-auto py-1"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowIndex = virtualRow.index;
            const rowStart = virtualRow.start;
            const rowItems: (IconsBrowserItem | null)[] = [];
            for (let i = 0; i < COLUMN_COUNT; i++) {
              const itemIndex = rowIndex * COLUMN_COUNT + i;
              rowItems.push(filteredIcons[itemIndex] ?? null);
            }

            return (
              <div
                key={virtualRow.key}
                className="grid gap-3 px-1"
                style={{
                  gridTemplateColumns: `repeat(${COLUMN_COUNT}, minmax(0, 1fr))`,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${rowStart}px)`,
                  height: virtualRow.size,
                }}
              >
                {rowItems.map((icon, idx) => {
                  if (!icon) {
                    return <div key={`empty-${virtualRow.key}-${idx}`} />;
                  }
                  return (
                    <IconGridCell
                      key={icon.id}
                      icon={icon}
                      cellSize={cellSize}
                      onClick={handleInsert}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
