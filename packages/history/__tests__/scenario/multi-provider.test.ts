import { HistoryImpl } from "../../src/history";
import { MockStore } from "../helpers/mock-store";
import { MockProvider } from "../helpers/mock-provider";
import { counterDelta } from "../helpers";

describe("Scenario: Multi-provider", () => {
  it("document + text provider in same tx → undo reverts both", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    const textState = { value: "" };

    const docProvider = new MockProvider("document");
    const textProvider = new MockProvider("text-session");
    h.register(docProvider);
    h.register(textProvider);

    store.set("node1", "width", 100);

    h.atomic("mixed edit", (tx) => {
      // Document change
      store.set("node1", "width", 200);
      tx.push(store.createDelta("node1", "width", 100, 200));

      // Text session change
      const before = textState.value;
      textState.value = "Hello";
      tx.push({
        providerId: "text-session",
        apply: () => {
          textState.value = "Hello";
        },
        revert: () => {
          textState.value = before;
        },
      });
    });

    expect(store.get("node1", "width")).toBe(200);
    expect(textState.value).toBe("Hello");

    await h.undo();
    expect(store.get("node1", "width")).toBe(100);
    expect(textState.value).toBe("");
  });

  it("text provider prepare() called before undo", async () => {
    const h = new HistoryImpl();
    const c = { value: 0 };
    const provider = new MockProvider("text");
    h.register(provider);

    h.atomic("edit", (tx) => {
      const d = counterDelta(c, 10, "text");
      d.apply();
      tx.push(d);
    });

    await h.undo();
    expect(provider.prepareCalls).toBe(1);
  });

  it("text provider prepare() fails → undo cancelled, stack unchanged", async () => {
    const h = new HistoryImpl();
    const c = { value: 0 };
    const provider = new MockProvider("text");
    provider.prepareShouldFail = true;
    h.register(provider);

    h.atomic("edit", (tx) => {
      const d = counterDelta(c, 10, "text");
      d.apply();
      tx.push(d);
    });

    const result = await h.undo();
    expect(result).toBe(false);
    expect(c.value).toBe(10); // not reverted
    expect(h.stack.canUndo).toBe(true);
  });

  it("provider disposed → prepare() not called", async () => {
    const h = new HistoryImpl();
    const c = { value: 0 };
    const provider = new MockProvider("text");
    const disposable = h.register(provider);

    h.atomic("edit", (tx) => {
      const d = counterDelta(c, 10, "text");
      d.apply();
      tx.push(d);
    });

    disposable.dispose();
    await h.undo();
    expect(provider.prepareCalls).toBe(0);
    expect(c.value).toBe(0); // still reverted — just no prepare
  });
});
