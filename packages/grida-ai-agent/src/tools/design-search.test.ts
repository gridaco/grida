import { describe, expect, it } from "vitest";
import { AgentDesignSearch } from "./design-search";

describe("AgentDesignSearch.createTool", () => {
  it("is client-resolved (NO execute) in an interactive host", () => {
    // Human-input: the call pauses for the user's picks, supplied via the
    // renderer's pick card (addToolResult). Like `question`, it ships bare.
    const tool = AgentDesignSearch.createTool({ interactive: true });
    expect(tool.execute).toBeUndefined();
  });

  it("ships a fixed-refusal execute in a headless host", async () => {
    const tool = AgentDesignSearch.createTool({ interactive: false });
    expect(tool.execute).toBeTypeOf("function");
    await expect(
      (tool.execute as (input: unknown, ctx: unknown) => Promise<unknown>)(
        { query: "x" },
        {}
      )
    ).rejects.toThrow(AgentDesignSearch.HEADLESS_REFUSAL);
  });

  it("requires a non-empty query", () => {
    const schema = AgentDesignSearch.createTool({ interactive: true })
      .inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ query: "calm abstract bg" }).success).toBe(true);
    expect(schema.safeParse({ query: "" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe("AgentDesignSearch.toModelOutput", () => {
  it("lists the picks WITH their urls so the agent can forward them as references", () => {
    const out = AgentDesignSearch.toModelOutput({
      picked: [
        { id: "a1", title: "Warm gradient", url: "https://x/a1.jpg" },
        { id: "b2", title: "Retro poster", url: "https://x/b2.jpg" },
      ],
    });
    expect(out.type).toBe("text");
    expect(out.value).toContain("[a1] Warm gradient");
    // the url is the payload the agent passes to generate_image's `references`
    expect(out.value).toContain("https://x/a1.jpg");
    expect(out.value).toContain("https://x/b2.jpg");
    // and the text tells it to do exactly that
    expect(out.value).toMatch(/references/i);
  });

  it("treats no picks / skipped as proceed-without-references guidance", () => {
    expect(
      AgentDesignSearch.toModelOutput({ picked: [], skipped: true }).value
    ).toMatch(/no references/i);
    expect(AgentDesignSearch.toModelOutput({ picked: [] }).value).toMatch(
      /no references/i
    );
  });
});
