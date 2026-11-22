/** GRIDA-SEC-016 — public link previews connect only to verified global addresses. */
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { get as httpGet, type IncomingMessage } from "node:http";
import { get as httpsGet, type RequestOptions } from "node:https";
import { BlockList, isIP } from "node:net";
import { WebPreview } from "@grida/desktop-bridge";

const reserved = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  reserved.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const) {
  reserved.addSubnet(address, prefix, "ipv6");
}

const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const MAX_PENDING_DNS = 4;
let pendingDns = 0;

export class PublicLinkPreviewBusy extends Error {}

function isPublicAddress({ address, family }: LookupAddress): boolean {
  if (isIP(address) !== family) return false;
  return family === 4
    ? !reserved.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !reserved.check(address, "ipv6");
}

async function resolvePublicAddress(hostname: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await lookupPublicHostname(hostname, signal);
  signal.throwIfAborted();
  if (
    !addresses.length ||
    addresses.length > 32 ||
    !addresses.every(isPublicAddress)
  )
    throw new Error("public_link_destination_unavailable");
  return addresses[0]!;
}

function lookupPublicHostname(hostname: string, signal: AbortSignal) {
  if (pendingDns >= MAX_PENDING_DNS)
    throw new PublicLinkPreviewBusy("public_link_lookup_busy");
  const query = lookup(hostname, { all: true, verbatim: true });
  pendingDns++;
  return new Promise<LookupAddress[]>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void query.then(resolve, reject).finally(() => {
      // The OS lookup can outlive the preview, so it keeps its slot until settled.
      pendingDns--;
      signal.removeEventListener("abort", abort);
    });
  });
}

export function publicLinkRedirect(
  location: string,
  base: string
): string | null {
  try {
    const url = new URL(location, base);
    if (base.startsWith("https:") && url.protocol !== "https:") return null;
    return WebPreview.normalizePublicUrl(url.href);
  } catch {
    return null;
  }
}

export async function requestPublicLink(
  url: URL,
  signal: AbortSignal
): Promise<IncomingMessage> {
  if (!WebPreview.normalizePublicUrl(url.href))
    throw new Error("public_link_destination_unavailable");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const address = await resolvePublicAddress(hostname, signal);
  signal.throwIfAborted();
  const get = url.protocol === "https:" ? httpsGet : httpGet;
  const options: RequestOptions & { autoSelectFamily: false } = {
    hostname,
    path: url.pathname + url.search,
    agent: false,
    signal,
    autoSelectFamily: false,
    family: address.family,
    rejectUnauthorized: true,
    maxHeaderSize: 32 * 1024,
    headers: { Host: url.host, "Accept-Encoding": "identity" },
    // Pin the checked address while keeping the original host for TLS.
    lookup: (_host, options, callback) => {
      if (options.all) callback(null, [address]);
      else callback(null, address.address, address.family);
    },
  };
  return new Promise((resolve, reject) => {
    get(options, resolve).once("error", reject);
  });
}
