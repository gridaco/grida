import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { AgentSurface } from ".";
import { createToolset, type AgentToolName } from "../tools";

function execute(candidate: unknown, input: unknown = {}): Promise<unknown> {
  return (candidate as (input: unknown, context: unknown) => Promise<unknown>)(
    input,
    {}
  );
}

describe("AgentSurface.createTools", () => {
  it("uses the exact flat model-facing tool identifiers", () => {
    expect(AgentSurface.TOOL_NAMES).toEqual({
      surface_open: "surface_open",
      surface_list_open: "surface_list_open",
    });
    expectTypeOf<AgentSurface.ToolName>().toEqualTypeOf<
      "surface_open" | "surface_list_open"
    >();
    const open: AgentToolName = "surface_open";
    const list: AgentToolName = "surface_list_open";
    expect([open, list]).toEqual(["surface_open", "surface_list_open"]);
  });

  it("always server-executes both tools", () => {
    const attached = AgentSurface.createTools({
      snapshot: { active: "/brief.md", open: ["/brief.md"] },
    });
    const detached = AgentSurface.createTools();

    expect(attached.surface_open.execute).toBeTypeOf("function");
    expect(attached.surface_list_open.execute).toBeTypeOf("function");
    expect(detached.surface_open.execute).toBeTypeOf("function");
    expect(detached.surface_list_open.execute).toBeTypeOf("function");
  });

  it("requires only a workspace-rooted path for surface_open", () => {
    const tools = AgentSurface.createTools();
    const schema = tools.surface_open.inputSchema as {
      safeParse: (value: unknown) => { success: boolean };
    };

    expect(schema.safeParse({ path: "/campaign.canvas" }).success).toBe(true);
    expect(schema.safeParse({ path: "/brief.md" }).success).toBe(true);
    expect(schema.safeParse({ path: "campaign.canvas" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
    expect(
      schema.safeParse({ path: "/campaign.canvas", kind: "canvas" }).success
    ).toBe(false);
  });

  it("acknowledges a request without claiming the renderer opened it", async () => {
    const tools = AgentSurface.createTools({
      snapshot: {
        active: "/brief.md",
        open: ["/brief.md", "/campaign.canvas"],
      },
    });

    await expect(
      execute(tools.surface_open.execute, { path: "/campaign.canvas" })
    ).resolves.toEqual({
      path: "/campaign.canvas",
      requested: true,
      reason: "requested",
    });
    await expect(execute(tools.surface_list_open.execute)).resolves.toEqual({
      interactive: true,
      active: "/brief.md",
      open: ["/brief.md", "/campaign.canvas"],
    });
  });

  it("returns continuation-safe no-ops without a snapshot", async () => {
    const tools = AgentSurface.createTools();

    await expect(
      execute(tools.surface_open.execute, { path: "/campaign.canvas" })
    ).resolves.toEqual({
      path: "/campaign.canvas",
      requested: false,
      reason: "not_interactive",
    });
    await expect(execute(tools.surface_list_open.execute)).resolves.toEqual({
      interactive: false,
      active: null,
      open: [],
    });
  });

  it("is always server-executed through the agent toolset", () => {
    const attached = createToolset({
      surface: { active: null, open: [] },
    });
    const detached = createToolset();

    expect(attached.surface_open.execute).toBeTypeOf("function");
    expect(attached.surface_list_open.execute).toBeTypeOf("function");
    expect(detached.surface_open.execute).toBeTypeOf("function");
    expect(detached.surface_list_open.execute).toBeTypeOf("function");
  });
});

describe("AgentSurface.parseSnapshot", () => {
  it("accepts strict state with active included in open", () => {
    expect(
      AgentSurface.parseSnapshot({
        active: "/campaign.canvas",
        open: ["/campaign.canvas", "/brief.md"],
      })
    ).toEqual({
      active: "/campaign.canvas",
      open: ["/campaign.canvas", "/brief.md"],
    });
    expect(AgentSurface.parseSnapshot({ active: null, open: [] })).toEqual({
      active: null,
      open: [],
    });
  });

  it("rejects malformed, relative, extra, or inconsistent state", () => {
    for (const input of [
      null,
      {},
      { active: null, open: [], extra: true },
      { active: "campaign.canvas", open: ["campaign.canvas"] },
      { active: "/campaign.canvas", open: ["/brief.md"] },
      { active: null, open: ["/brief.md", 1] },
    ]) {
      expect(AgentSurface.parseSnapshot(input)).toBeUndefined();
    }
  });

  it("copies the open array at the boundary", () => {
    const open = ["/brief.md"];
    const snapshot = AgentSurface.parseSnapshot({ active: null, open })!;
    open.push("/later.md");
    expect(snapshot.open).toEqual(["/brief.md"]);
  });
});

describe("AgentSurface.observeToolCall", () => {
  it("fire-and-forgets surface_open without producing model output", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const open = vi.fn<AgentSurface.Host["open"]>(() => pending);
    const host: AgentSurface.Host = {
      open,
      listOpen: () => ({ active: null, open: [] }),
    };

    expect(
      AgentSurface.observeToolCall(host, {
        tool_name: "surface_open",
        input: { path: "/campaign.canvas" },
      })
    ).toBe(true);
    expect(open).toHaveBeenCalledWith("/campaign.canvas");
    release();
    await pending;
  });

  it("recognizes list calls without reading mutable host state", () => {
    const listOpen = vi.fn<AgentSurface.Host["listOpen"]>(() => ({
      active: "/campaign.canvas",
      open: ["/campaign.canvas"],
    }));
    const host: AgentSurface.Host = {
      open: () => undefined,
      listOpen,
    };

    expect(
      AgentSurface.observeToolCall(host, {
        tool_name: "surface_list_open",
        input: {},
      })
    ).toBe(true);
    expect(listOpen).not.toHaveBeenCalled();
  });

  it("contains synchronous throws and asynchronous rejections", async () => {
    const syncHost: AgentSurface.Host = {
      open: () => {
        throw new Error("detached");
      },
      listOpen: () => ({ active: null, open: [] }),
    };
    const asyncHost: AgentSurface.Host = {
      open: async () => {
        throw new Error("detached");
      },
      listOpen: () => ({ active: null, open: [] }),
    };

    expect(
      AgentSurface.observeToolCall(syncHost, {
        tool_name: "surface_open",
        input: { path: "/campaign.canvas" },
      })
    ).toBe(true);
    expect(
      AgentSurface.observeToolCall(asyncHost, {
        tool_name: "surface_open",
        input: { path: "/campaign.canvas" },
      })
    ).toBe(true);
    await Promise.resolve();
  });

  it("does not claim unrelated, dynamic, or malformed calls", () => {
    const host: AgentSurface.Host = {
      open: () => undefined,
      listOpen: () => ({ active: null, open: [] }),
    };

    expect(
      AgentSurface.observeToolCall(host, {
        tool_name: "read_file",
        input: { path: "/x" },
      })
    ).toBe(false);
    expect(
      AgentSurface.observeToolCall(host, {
        tool_name: "surface_open",
        input: { path: "relative.canvas" },
      })
    ).toBe(false);
    expect(
      AgentSurface.observeToolCall(host, {
        tool_name: "surface_open",
        input: { path: "/x" },
        dynamic: true,
      })
    ).toBe(false);
  });
});

describe("AgentSurface model output", () => {
  it("states that requested is not proof of renderer completion", () => {
    const output = AgentSurface.toModelOpenOutput({
      path: "/campaign.canvas",
      requested: true,
      reason: "requested",
    }).value;

    expect(output).toMatch(/acknowledges the request only/i);
    expect(output).toMatch(/not that the artifact opened/i);
    expect(output).toMatch(/continue/i);
  });

  it("makes the noninteractive open no-op continuation-safe", () => {
    const output = AgentSurface.toModelOpenOutput({
      path: "/campaign.canvas",
      requested: false,
      reason: "not_interactive",
    }).value;

    expect(output).toMatch(/expected successful no-op/i);
    expect(output).toMatch(/do not retry/i);
    expect(output).toMatch(/continue/i);
  });
});
