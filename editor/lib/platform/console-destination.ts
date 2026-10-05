// GRIDA-SEC-010 — source mirror of infra contracts/platform/destinations.json.
const objectIDs = {
  keys: /^key_[A-Za-z0-9_-]{8,128}$/,
  byok: /^byok_[A-Za-z0-9_-]{8,128}$/,
  requests: /^req_[A-Za-z0-9_-]{8,128}$/,
  media: /^job_[A-Za-z0-9_-]{8,128}$/,
};
const typedObject = (kind: string, value: string) =>
  Object.hasOwn(objectIDs, kind) &&
  objectIDs[kind as keyof typeof objectIDs].test(value);
const purchaseID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const canonicalID = (value: string) =>
  /^[1-9][0-9]*$/.test(value) && BigInt(value) <= BigInt("9223372036854775807");
const enums: Record<string, readonly string[]> = {
  range: [
    "5m",
    "15m",
    "1h",
    "6h",
    "12h",
    "24h",
    "3d",
    "7d",
    "14d",
    "30d",
    "custom",
  ],
  bucket: ["minute", "hour", "day"],
  group_by: ["model", "provider", "key", "operation", "funding"],
  compare: ["true", "false"],
  funding_mode: ["grida", "byok"],
  status: ["pending", "running", "unknown", "succeeded", "failed", "canceled"],
};

/** Strict calendar validation and UTC normalization preserve fractional seconds. */
function timestamp(value: string): string | null {
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value
    );
  if (!parts) return null;
  const [
    ,
    ys,
    ms,
    ds,
    hs,
    mins,
    ss,
    fraction = "",
    zone,
    sign,
    zhs = "0",
    zms = "0",
  ] = parts;
  const [year, month, day, hour, minute, second, zh, zm] = [
    ys,
    ms,
    ds,
    hs,
    mins,
    ss,
    zhs,
    zms,
  ].map(Number);
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, day);
  at.setUTCHours(hour, minute, second, 0);
  if (
    at.getUTCFullYear() !== year ||
    at.getUTCMonth() !== month - 1 ||
    at.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    zh > 23 ||
    zm > 59
  )
    return null;
  const offset = zone === "Z" ? 0 : (sign === "-" ? -1 : 1) * (zh * 60 + zm);
  const iso = new Date(at.getTime() - offset * 60_000).toISOString();
  if (!/^\d{4}-/.test(iso)) return null;
  const nanos = fraction.slice(0, 9).replace(/0+$/, "");
  return iso.slice(0, 19) + (nanos ? `.${nanos}` : "") + "Z";
}

const reportFilters = [
  "from",
  "to",
  "range",
  "model",
  "provider",
  "key_id",
  "operation",
  "funding_mode",
  "status",
];
export function organizationRoute(
  pathname: string
): { organization: string; section: string } | null {
  const parts = pathname.split("/").slice(1);
  if (parts[0] !== "organizations" || !canonicalID(parts[1] || "")) return null;
  if (parts[2] === "billing") {
    if (
      parts.length === 3 ||
      (parts.length === 4 && parts[3] === "upgrade") ||
      (parts.length === 5 &&
        parts[3] === "purchases" &&
        purchaseID.test(parts[4]))
    )
      return { organization: parts[1], section: "/billing" };
    return null;
  }
  if (parts[2] !== "gateway") return null;
  if (parts.length === 3) return { organization: parts[1], section: "/" };
  if (
    ![
      "usage",
      "requests",
      "keys",
      "byok",
      "media",
      "models",
      "operations",
    ].includes(parts[3])
  )
    return null;
  if (
    parts.length === 4 ||
    (parts.length === 5 &&
      ["requests", "keys", "byok", "media"].includes(parts[3]) &&
      typedObject(parts[3], parts[4]))
  )
    return { organization: parts[1], section: `/${parts[3]}` };
  return null;
}
/** A continuation names a destination; resource authority is checked again by the API. */
export function destination(raw: string): string | null {
  if (!raw) return "/";
  if (
    raw.length > 2048 ||
    Array.from(raw).some(
      (character) =>
        character === "\\" ||
        character === "#" ||
        character.charCodeAt(0) < 32 ||
        character.charCodeAt(0) === 127
    ) ||
    raw.toLowerCase().includes("%25") ||
    !raw.startsWith("/") ||
    raw.startsWith("//")
  )
    return null;
  const [pathname, query = "", extra] = raw.split("?");
  if (extra !== undefined || pathname.includes("%")) return null;
  const route = organizationRoute(pathname);
  if (pathname !== "/" && !route) return null;
  const parts = pathname.split("/");
  const list = parts.length === 5;
  const allowed =
    route?.section === "/usage" && list
      ? [...reportFilters, "bucket", "group_by", "compare"]
      : route?.section === "/requests" && list
        ? reportFilters
        : route?.section === "/media" && list
          ? reportFilters.filter((key) => key !== "key_id")
          : [];
  const params = new URLSearchParams(query);
  for (const [key, value] of params) {
    if (params.getAll(key).length !== 1 || !allowed.includes(key)) return null;
    if (key === "from" || key === "to") {
      const canonical = timestamp(value);
      if (!canonical) return null;
      params.set(key, canonical);
    } else if (key === "key_id") {
      if (!typedObject("keys", value)) return null;
    } else if (enums[key]) {
      if (!enums[key].includes(value)) return null;
    } else if (
      !value ||
      value.length > 128 ||
      !/^[A-Za-z0-9_./:-]+$/.test(value)
    )
      return null;
  }
  if (params.has("from") && params.has("to")) {
    const duration =
      Date.parse(params.get("to")!) - Date.parse(params.get("from")!);
    if (duration <= 0 || duration > 90 * 24 * 60 * 60 * 1000) return null;
  }
  params.sort();
  return pathname + (params.size ? `?${params}` : "");
}
