import { describe, expect, it, vi } from "vitest";
import { AgentTodos } from "./index";

const t = (
  content: string,
  status: AgentTodos.Todo["status"] = "pending",
  activeForm?: string
): AgentTodos.Todo => ({
  content,
  active_form: activeForm ?? content.replace(/^\w+/, (m) => `${m}ing`),
  status,
});

describe("AgentTodos", () => {
  it("starts empty", () => {
    const store = new AgentTodos();
    expect(store.snapshot()).toEqual([]);
  });

  it("write replaces the entire list", () => {
    const store = new AgentTodos();
    const r1 = store.write([t("A"), t("B", "in_progress")]);
    expect(r1.ok).toBe(true);
    expect(r1.count).toBe(2);
    expect(store.snapshot().map((x) => x.content)).toEqual(["A", "B"]);

    const r2 = store.write([t("C", "completed")]);
    expect(r2.count).toBe(1);
    expect(store.snapshot().map((x) => x.content)).toEqual(["C"]);
  });

  it("clear empties the list", () => {
    const store = new AgentTodos();
    store.write([t("A")]);
    store.clear();
    expect(store.snapshot()).toEqual([]);
  });

  it("clear is a no-op when already empty (no spurious notify)", () => {
    const store = new AgentTodos();
    const cb = vi.fn<() => void>();
    store.subscribe(cb);
    store.clear();
    expect(cb).not.toHaveBeenCalled();
  });

  it("subscribe fires on every write and clear", () => {
    const store = new AgentTodos();
    const cb = vi.fn<() => void>();
    const unsub = store.subscribe(cb);
    store.write([t("A")]);
    store.write([t("A"), t("B")]);
    store.clear();
    expect(cb).toHaveBeenCalledTimes(3);
    unsub();
    store.write([t("Z")]);
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("write with an identical list is a no-op (no notify, no snapshot churn)", () => {
    const store = new AgentTodos();
    const cb = vi.fn<() => void>();
    store.write([t("A"), t("B", "in_progress")]);
    const before = store.snapshot();
    store.subscribe(cb);
    store.write([t("A"), t("B", "in_progress")]);
    expect(cb).not.toHaveBeenCalled();
    expect(store.snapshot()).toBe(before);
    // A genuine change still fires.
    store.write([t("A", "completed"), t("B", "in_progress")]);
    expect(cb).toHaveBeenCalledOnce();
  });

  it("snapshot returns the same array reference until the next write", () => {
    const store = new AgentTodos();
    store.write([t("A")]);
    const a = store.snapshot();
    const b = store.snapshot();
    expect(a).toBe(b);
    store.write([t("B")]);
    expect(store.snapshot()).not.toBe(a);
  });

  it("write defensively copies — caller's mutation doesn't leak in", () => {
    const store = new AgentTodos();
    const list: AgentTodos.Todo[] = [t("A")];
    store.write(list);
    list[0].content = "MUTATED";
    expect(store.snapshot()[0].content).toBe("A");
  });
});
