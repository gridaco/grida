export type IconsBrowserItem = {
  id: string;
  name: string;
  download: string;
  tags?: string[];
  vendor?: string;
};

export type GridaIconsLibraryCategory =
  | "grida://library/categories/logos"
  | "grida://library/categories/icons-ui"
  | (string & {});

export type IconVendorId = string;

export type VendorVariantSpec = {
  title: string;
  default: string;
  enum: string[];
};

export type IconVendor = {
  id: string;
  name: string;
  vendor: IconVendorId;
  count: number;
  categories: GridaIconsLibraryCategory[];
  variants: Record<string, VendorVariantSpec>;
};

export type IconVariantFilters = Record<string, string>;

export const ICONS_API_URL = "https://icons.grida.co/api";
export const ICONS_VENDORS_API_URL = "https://icons.grida.co/api/vendors";
export const ALLOWED_CATEGORY: GridaIconsLibraryCategory =
  "grida://library/categories/icons-ui";
export const ANY_VARIANT = "__any";

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

const normalizeIcons = (
  rawList: any[],
  allowedVendors?: Set<IconVendorId>
): IconsBrowserItem[] => {
  const hasAllowed = allowedVendors ? allowedVendors.size > 0 : false;
  return rawList
    .map((item, index) => {
      const download = item?.download;
      if (!download) return null;
      const vendor = item?.vendor || item?.host || item?.family || "";
      if (hasAllowed && allowedVendors && !allowedVendors.has(vendor)) {
        return null;
      }
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
        metaParts.length > 0 ? `${friendlyBase} (${metaParts})` : friendlyBase;
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
};

const parseVendorPayload = (payload: any): IconVendor[] => {
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

  return list.filter(
    (v) => v.id && v.categories.includes(ALLOWED_CATEGORY)
  ) as IconVendor[];
};

export async function fetchIconVendors(): Promise<IconVendor[]> {
  const res = await fetch(ICONS_VENDORS_API_URL, {
    cache: "force-cache",
  });
  if (!res.ok) {
    throw new Error(`Failed to load vendors (${res.status})`);
  }
  const payload = await res.json();
  return parseVendorPayload(payload);
}

export async function fetchIcons({
  vendor,
  variants,
  allowedVendors,
}: {
  vendor?: IconVendorId | null;
  variants?: IconVariantFilters;
  allowedVendors?: Iterable<IconVendorId>;
}): Promise<IconsBrowserItem[]> {
  const params = new URLSearchParams();
  if (vendor) {
    params.set("vendor", vendor);
  }
  Object.entries(variants ?? {}).forEach(([key, value]) => {
    if (!value || value === ANY_VARIANT) return;
    params.set(`variant:${key}`, value);
  });
  const url =
    params.size > 0 ? `${ICONS_API_URL}?${params.toString()}` : ICONS_API_URL;
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
  const allowedSet = allowedVendors
    ? new Set<IconVendorId>(allowedVendors)
    : undefined;
  return normalizeIcons(rawList, allowedSet);
}

export const getDefaultVariants = (vendor?: IconVendor) => {
  if (!vendor) return {};
  return Object.fromEntries(
    Object.entries(vendor.variants).map(([key]) => [key, ANY_VARIANT])
  );
};
