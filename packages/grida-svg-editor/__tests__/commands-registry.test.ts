import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../src/commands/registry";

describe("CommandRegistry", () => {
  it("invokes a registered handler and returns true when consumed", () => {
    const reg = new CommandRegistry();
    const handler = vi.fn<() => boolean>(() => true);
    reg.register("test.cmd", handler);
    expect(reg.invoke("test.cmd")).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("returns false for unknown ids", () => {
    const reg = new CommandRegistry();
    expect(reg.invoke("nope")).toBe(false);
  });

  it("returns false when handler returns void/undefined", () => {
    const reg = new CommandRegistry();
    reg.register("test.void", () => {
      /* no return */
    });
    expect(reg.invoke("test.void")).toBe(false);
  });

  it("returns false when handler returns false", () => {
    const reg = new CommandRegistry();
    reg.register("test.false", () => false);
    expect(reg.invoke("test.false")).toBe(false);
  });

  it("re-registering replaces the previous handler", () => {
    const reg = new CommandRegistry();
    const first = vi.fn<() => boolean>(() => true);
    const second = vi.fn<() => boolean>(() => true);
    reg.register("test.cmd", first);
    reg.register("test.cmd", second);
    reg.invoke("test.cmd");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("unregister removes the handler", () => {
    const reg = new CommandRegistry();
    const handler = vi.fn<() => boolean>(() => true);
    const off = reg.register("test.cmd", handler);
    off();
    expect(reg.invoke("test.cmd")).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("unregister does not affect a later registration of the same id", () => {
    const reg = new CommandRegistry();
    const first = vi.fn<() => boolean>(() => true);
    const second = vi.fn<() => boolean>(() => true);
    const off = reg.register("test.cmd", first);
    reg.register("test.cmd", second); // replaces
    off(); // should NOT remove second
    expect(reg.invoke("test.cmd")).toBe(true);
    expect(second).toHaveBeenCalledOnce();
  });

  it("has() reflects current registration", () => {
    const reg = new CommandRegistry();
    expect(reg.has("x")).toBe(false);
    reg.register("x", () => true);
    expect(reg.has("x")).toBe(true);
  });

  it("forwards args to handler", () => {
    const reg = new CommandRegistry();
    const handler = vi.fn<() => boolean>(() => true);
    reg.register("test.cmd", handler);
    reg.invoke("test.cmd", { foo: 42 });
    expect(handler).toHaveBeenCalledWith({ foo: 42 });
  });
});
