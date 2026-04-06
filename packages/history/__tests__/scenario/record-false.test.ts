import { HistoryImpl } from "../../src/history";
import { MockStore } from "../helpers/mock-store";

describe("Scenario: record:false", () => {
  it("remote change not on stack", () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("node1", "x", 0);

    h.atomic(
      "remote move",
      (tx) => {
        store.set("node1", "x", 100);
        tx.push(store.createDelta("node1", "x", 0, 100));
      },
      { origin: { type: "remote", peerId: "peer-1" }, record: false }
    );

    expect(store.get("node1", "x")).toBe(100);
    expect(h.stack.canUndo).toBe(false);
  });

  it("undo after remote change → only undoes local", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("node1", "x", 0);
    store.set("node1", "color", "red");

    // Local change
    h.atomic("local move", (tx) => {
      store.set("node1", "x", 100);
      tx.push(store.createDelta("node1", "x", 0, 100));
    });

    // Remote change (not on stack)
    h.atomic(
      "remote color",
      (tx) => {
        store.set("node1", "color", "blue");
        tx.push(store.createDelta("node1", "color", "red", "blue"));
      },
      { record: false }
    );

    expect(store.get("node1", "x")).toBe(100);
    expect(store.get("node1", "color")).toBe("blue");

    await h.undo();
    expect(store.get("node1", "x")).toBe(0); // local undone
    expect(store.get("node1", "color")).toBe("blue"); // remote stays
  });

  it("local, remote, local → undo, undo → both local undone", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("n", "a", 0);
    store.set("n", "b", 0);
    store.set("n", "c", 0);

    // Local 1
    h.atomic("local1", (tx) => {
      store.set("n", "a", 1);
      tx.push(store.createDelta("n", "a", 0, 1));
    });

    // Remote
    h.atomic(
      "remote",
      (tx) => {
        store.set("n", "b", 1);
        tx.push(store.createDelta("n", "b", 0, 1));
      },
      { record: false }
    );

    // Local 2
    h.atomic("local2", (tx) => {
      store.set("n", "c", 1);
      tx.push(store.createDelta("n", "c", 0, 1));
    });

    expect(h.stack.pastCount).toBe(2); // only local txs

    await h.undo(); // undo local2
    expect(store.get("n", "c")).toBe(0);
    expect(store.get("n", "b")).toBe(1); // remote untouched

    await h.undo(); // undo local1
    expect(store.get("n", "a")).toBe(0);
    expect(store.get("n", "b")).toBe(1); // still untouched
  });
});
