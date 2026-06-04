/**
 * Prefix-sortable monotonic IDs for chat sessions / messages / parts.
 *
 * Shape: `<prefix>_<12-hex-timestamp><14-base62-random>` — 26 chars.
 *
 * - The timestamp is `Date.now()` (epoch ms) in hex, **stuffed with an
 *   in-memory counter** to break ties when two ids are minted in the
 *   same millisecond. Counter rolls back to 0 the next ms.
 * - Lexicographic sort of the id string therefore matches insertion
 *   order. Greppable in logs and useful as a stable cursor.
 * - The random tail uses `crypto.randomBytes` rendered in base62 so two
 *   processes minting in the same ms (e.g. concurrent CLI + agent host)
 *   don't collide on the timestamp portion alone.
 *
 * Prefix shape is `ses_…`, `msg_…`, `prt_…`; the monotonic counter is
 * the load-bearing detail.
 */

import crypto from "node:crypto";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

let lastMs = 0;
let counter = 0;

function nextStamp(): string {
  const now = Date.now();
  if (now === lastMs) {
    counter += 1;
  } else {
    lastMs = now;
    counter = 0;
  }
  const stamp = (BigInt(now) << 12n) | BigInt(counter & 0xfff);
  return stamp.toString(16).padStart(12, "0").slice(-12);
}

function randomTail(): string {
  const bytes = crypto.randomBytes(11);
  let acc = 0n;
  for (const b of bytes) {
    acc = (acc << 8n) | BigInt(b);
  }
  let out = "";
  while (out.length < 14) {
    out = BASE62[Number(acc % 62n)] + out;
    acc /= 62n;
  }
  return out;
}

function mint(prefix: string): string {
  return `${prefix}_${nextStamp()}${randomTail()}`;
}

export function newSessionId(): string {
  return mint("ses");
}

export function newMessageId(): string {
  return mint("msg");
}

export function newPartId(): string {
  return mint("prt");
}
