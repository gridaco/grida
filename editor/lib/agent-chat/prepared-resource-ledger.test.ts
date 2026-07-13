import { describe, expect, it } from "vitest";
import { PreparedResourceLedger } from "./prepared-resource-ledger";

const first = {
  kind: "url-reference",
  source: "library",
  sourceId: "pin-1",
  dedupeKey: "library:pin-1",
  name: "First",
  mimeType: "image/png",
  url: "https://example.com/first.png",
} as const;

const second = {
  kind: "scratch-file",
  source: "drop",
  sourceId: "drop-1",
  name: "brief.pdf",
  mimeType: "application/pdf",
  size: 3,
  base64: "AAAA",
} as const;

describe("PreparedResourceLedger", () => {
  it("selects typed resources in composer attachment order", () => {
    const ledger = new PreparedResourceLedger();
    ledger.bind("attachment-1", first);
    ledger.bind("attachment-2", second);

    expect(ledger.select(["attachment-2", "attachment-1"])).toEqual({
      status: "ready",
      resources: [
        { attachmentId: "attachment-2", resource: second },
        { attachmentId: "attachment-1", resource: first },
      ],
    });
  });

  it("fails closed when a visible card has no prepared resource", () => {
    const ledger = new PreparedResourceLedger();
    ledger.bind("attachment-1", first);

    expect(ledger.select(["attachment-1", "attachment-missing"])).toEqual({
      status: "missing",
      attachmentIds: ["attachment-missing"],
    });
  });

  it("owns dedupe, removal, reconciliation, and clearing", () => {
    const ledger = new PreparedResourceLedger();
    ledger.bind("attachment-1", first);
    ledger.bind("attachment-2", second);
    expect(ledger.all()).toEqual([first, second]);
    expect(ledger.hasDedupeKey("library:pin-1")).toBe(true);

    ledger.remove("attachment-1");
    expect(ledger.hasDedupeKey("library:pin-1")).toBe(false);

    ledger.reconcile([]);
    expect(ledger.select([])).toEqual({ status: "ready", resources: [] });

    ledger.bind("attachment-1", first);
    ledger.clear();
    expect(ledger.select(["attachment-1"])).toEqual({
      status: "missing",
      attachmentIds: ["attachment-1"],
    });
  });
});
