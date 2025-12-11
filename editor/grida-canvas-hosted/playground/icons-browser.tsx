"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui-editor/progress";

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
  vendor: string;
  count: number;
};

const ICONS_API_URL = "https://icons.grida.co/api";
const ICONS_VENDORS_API_URL = "https://icons.grida.co/api/vendors";
const COLUMN_COUNT = 5;

export type IconsBrowserProps = {
  onInsert?: (icon: IconsBrowserItem) => Promise<void> | void;
};

export function IconsBrowser({ onInsert }: IconsBrowserProps) {
  const [icons, setIcons] = useState<IconsBrowserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const [vendors, setVendors] = useState<IconVendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string | null>(
    "phosphor-icons"
  );

  const fetchIcons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(ICONS_API_URL, { cache: "no-store" });
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
      const normalized = rawList
        .map((item, index) => {
          const download = item?.download;
          if (!download) return null;
          const vendor = item?.vendor || item?.host || item?.family || "icon";
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
  }, []);

  useEffect(() => {
    void fetchIcons();
  }, [fetchIcons]);

  useEffect(() => {
    const loadVendors = async () => {
      try {
        const res = await fetch(ICONS_VENDORS_API_URL, {
          cache: "force-cache",
        });
        if (!res.ok) throw new Error(`Failed to load vendors (${res.status})`);
        const payload = await res.json();
        const list: IconVendor[] =
          (payload?.items as any[])?.map((v) => ({
            id: v?.id ?? v?.vendor ?? "",
            name: v?.name ?? v?.vendor ?? "",
            vendor: v?.vendor ?? v?.id ?? "",
            count: Number(v?.count ?? 0),
          })) ?? [];
        setVendors(list.filter((v) => v.id));
      } catch (e) {
        console.warn("Failed to load icon vendors", e);
      }
    };
    void loadVendors();
  }, []);

  const filteredIcons = useMemo(() => {
    const base = selectedVendor
      ? icons.filter((i) => i.vendor === selectedVendor)
      : icons;
    if (!query) return base;
    const term = query.toLowerCase();
    return base.filter(
      (icon) =>
        icon.name.toLowerCase().includes(term) ||
        icon.tags?.some((tag) => tag.toLowerCase().includes(term))
    );
  }, [icons, query, selectedVendor]);

  const handleInsert = useCallback(
    async (icon: IconsBrowserItem) => {
      if (!onInsert) return;
      const task = Promise.resolve(onInsert(icon));
      toast.promise(task, {
        loading: "Loading icon...",
        success: "Icon inserted",
        error: "Failed to insert icon",
      });
    },
    [onInsert]
  );

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(filteredIcons.length / COLUMN_COUNT),
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 100,
    overscan: 4,
  });

  const toTitleCase = (value: string) => {
    return value
      .replace(/[-_]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="text-sm pointer-events-auto bg-background h-full flex flex-col">
      <header className="space-y-2 p-2 border-b">
        <div className="flex gap-2">
          <input
            className="w-full rounded-md border px-2 py-1 text-sm"
            placeholder="Search icons"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border px-2.5 py-2 text-sm hover:bg-muted transition"
                onClick={() => {
                  void fetchIcons();
                }}
                aria-label="Reload icons"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent sideOffset={4}>Reload icons</TooltipContent>
          </Tooltip>
        </div>
        {vendors.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            <button
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                selectedVendor === null
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/80 hover:bg-muted"
              }`}
              onClick={() => setSelectedVendor(null)}
            >
              All
            </button>
            {vendors.map((vendor) => (
              <button
                key={vendor.id}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  selectedVendor === vendor.vendor
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/80 hover:bg-muted"
                }`}
                onClick={() => setSelectedVendor(vendor.vendor)}
              >
                {vendor.name} ({vendor.count})
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="w-full overflow-visible" style={{ height: 0 }}>
        {loading && <Progress className="h-px" indeterminate />}
      </div>
      {error && (
        <div className="text-xs text-destructive">Failed to load: {error}</div>
      )}
      {!loading && !error && filteredIcons.length === 0 && (
        <div className="text-xs text-muted-foreground">
          No icons found. Try another search.
        </div>
      )}
      <div
        ref={scrollParentRef}
        className="relative w-full flex-1 min-h-0 overflow-auto"
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
                    <Tooltip key={icon.id}>
                      <TooltipTrigger asChild>
                        <button
                          className="flex flex-col items-center justify-center gap-1 p-1.5 hover:bg-muted transition text-foreground/80 rounded-sm"
                          onClick={() => {
                            void handleInsert(icon);
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={icon.download}
                            alt={icon.name}
                            loading="lazy"
                            className="h-8 w-8 object-contain dark:invert"
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        sideOffset={2}
                        className="z-[99999]"
                      >
                        {icon.name} ({icon.tags?.[0] ?? "icon"})
                      </TooltipContent>
                    </Tooltip>
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
