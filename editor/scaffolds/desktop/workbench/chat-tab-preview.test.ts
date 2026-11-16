import { describe, expect, it } from "vitest";
import { ChatTabPreview } from "./chat-tab-preview";

describe("ChatTabPreview.latest", () => {
  it("shows the latest visible message of each role in transcript order", () => {
    expect(
      ChatTabPreview.latest([
        { role: "user", text: "Earlier question" },
        { role: "assistant", text: "Earlier response" },
        { role: "user", text: "Current question" },
        { role: "assistant", text: "Checking the file" },
        { role: "assistant", text: "Current response" },
        { role: "assistant", text: " \n " },
      ])
    ).toEqual([
      { role: "user", text: "Current question" },
      { role: "assistant", text: "Current response" },
    ]);
    expect(
      ChatTabPreview.latest([
        { role: "assistant", text: "Previous answer" },
        { role: "user", text: "Follow-up question" },
      ])
    ).toEqual([
      { role: "assistant", text: "Previous answer" },
      { role: "user", text: "Follow-up question" },
    ]);
  });

  it("bounds plain-text excerpts and keeps attachment-only input visible", () => {
    const excerpts = ChatTabPreview.latest([
      { role: "user", text: "", attachments: [{ name: "reference.png" }] },
      { role: "assistant", text: `  A\n\t${"long ".repeat(200)}  ` },
    ]);
    expect(excerpts[0]).toEqual({ role: "user", text: "reference.png" });
    expect(excerpts[1].text).toHaveLength(ChatTabPreview.MAX_EXCERPT_LENGTH);
    expect(excerpts[1].text).toMatch(/^A long/);
    expect(excerpts[1].text).toMatch(/…$/);
    expect(excerpts[1].text).not.toContain("\n");
    expect(ChatTabPreview.latest([])).toEqual([]);
  });

  it("flattens headings, emphasis, lists, task markers and fenced code", () => {
    const text = [
      "# Composer **review**",
      "",
      "Keep *drafts*, ~~old styling~~ and [link labels](https://example.test).",
      "",
      "1. First item",
      "2. Second item",
      "",
      "- [x] Keep the icon",
      "- [ ] Check the spacing",
      "",
      "> Short note",
      "",
      "```typescript",
      'const answer = "**literal**";',
      "```",
    ].join("\n");
    expect(ChatTabPreview.latest([{ role: "assistant", text }])).toEqual([
      {
        role: "assistant",
        text: 'Composer review Keep drafts, old styling and link labels. First item Second item Keep the icon Check the spacing Short note const answer = "**literal**";',
      },
    ]);
  });

  it("uses reference labels, image alt text and GFM table cells without destinations", () => {
    const text = [
      "Read [the guide][guide] and ![spacing diagram][diagram].",
      "",
      "| Name | State |",
      "| --- | --- |",
      "| **Shared** | `Ready` |",
      "",
      '[guide]: https://example.test/guide "Hidden title"',
      "[diagram]: https://example.test/image.png",
    ].join("\n");
    expect(ChatTabPreview.latest([{ role: "assistant", text }])).toEqual([
      {
        role: "assistant",
        text: "Read the guide and spacing diagram. Name State Shared Ready",
      },
    ]);
  });

  it("preserves escaped punctuation and code as literal text", () => {
    const text =
      "\\*literal stars\\* \\[raw label\\] \\#not-a-heading and \\_underscores\\_.\n\n`**code** [label](url) <img src=x> \\path`";
    expect(
      ChatTabPreview.latest([
        {
          role: "user",
          text,
        },
      ])
    ).toEqual([
      {
        role: "user",
        text: "*literal stars* [raw label] #not-a-heading and _underscores_. **code** [label](url) <img src=x> \\path",
      },
    ]);
  });

  it("keeps raw and escaped HTML source inert instead of interpreting tags", () => {
    expect(
      ChatTabPreview.latest([
        { role: "user", text: "**Check** <img src=x>" },
        {
          role: "assistant",
          text: "<script>output</script>\n\n\\<img src=x\\>",
        },
      ])
    ).toEqual([
      { role: "user", text: "Check <img src=x>" },
      { role: "assistant", text: "<script>output</script> <img src=x>" },
    ]);
  });

  it("keeps attachment filenames literal when Markdown has no visible text", () => {
    const name = "**raw** [design](v2)_final.png";
    expect(
      ChatTabPreview.latest([
        {
          role: "user",
          text: "[reference]: https://example.test",
          attachments: [{ name }],
        },
      ])
    ).toEqual([{ role: "user", text: name }]);
  });

  it("bounds source before parsing and marks a truncated source honestly", () => {
    expect(
      ChatTabPreview.latest([
        { role: "assistant", text: "Earlier visible answer" },
        { role: "assistant", text: `${" ".repeat(32 * 1024)}Late answer` },
        {
          role: "user",
          text: `Visible start\n\n[reference]: https://example.test/${"x".repeat(64 * 1024)}`,
        },
      ])
    ).toEqual([
      { role: "assistant", text: "Earlier visible answer" },
      { role: "user", text: "Visible start…" },
    ]);
  });

  it("keeps deeply nested and prefix-truncated Markdown safe and bounded", () => {
    const messages: ChatTabPreview.Message[] = [
      { role: "user", text: `${"> ".repeat(6000)}Nested note` },
      {
        role: "assistant",
        text: `An incomplete [link](${"path/".repeat(10_000)}`,
      },
    ];
    const excerpts = ChatTabPreview.latest(messages);
    expect(excerpts.map((excerpt) => excerpt.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(
      excerpts.every(
        (excerpt) => excerpt.text.length <= ChatTabPreview.MAX_EXCERPT_LENGTH
      )
    ).toBe(true);
    expect(excerpts[1].text).toMatch(/^An incomplete/);
    expect(excerpts[1].text).toMatch(/…$/);
  });
});
