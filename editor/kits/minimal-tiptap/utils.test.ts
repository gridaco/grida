import { toTiptapContent } from "./utils";

describe("toTiptapContent", () => {
  it("returns undefined for null / undefined", () => {
    expect(toTiptapContent(null)).toBeUndefined();
    expect(toTiptapContent(undefined)).toBeUndefined();
  });

  it("passes HTML strings through", () => {
    expect(toTiptapContent("<p>hello</p>")).toBe("<p>hello</p>");
    expect(toTiptapContent("plain text")).toBe("plain text");
  });

  it("accepts a tiptap doc object verbatim", () => {
    const doc = { type: "doc", content: [{ type: "paragraph" }] };
    expect(toTiptapContent(doc)).toBe(doc);
  });

  it("parses a JSON-serialized tiptap doc", () => {
    const doc = { type: "doc", content: [{ type: "paragraph" }] };
    const result = toTiptapContent(JSON.stringify(doc));
    expect(result).toEqual(doc);
  });

  it("discards legacy BlockNote block arrays", () => {
    const legacy = [
      { id: "1", type: "paragraph", props: {}, content: [], children: [] },
    ];
    expect(toTiptapContent(legacy)).toBeUndefined();
  });

  it("discards JSON-serialized legacy BlockNote block arrays", () => {
    const legacy = [
      { id: "1", type: "paragraph", props: {}, content: [], children: [] },
    ];
    expect(toTiptapContent(JSON.stringify(legacy))).toBeUndefined();
  });

  it("discards malformed JSON-looking strings (does not fall through to HTML)", () => {
    expect(toTiptapContent("{not: valid json")).toBeUndefined();
    expect(toTiptapContent("[oops")).toBeUndefined();
  });

  it("discards non-doc JSON objects", () => {
    expect(toTiptapContent({ some: "other shape" })).toBeUndefined();
    expect(
      toTiptapContent(JSON.stringify({ some: "other shape" }))
    ).toBeUndefined();
  });

  it("trims whitespace before detecting JSON prefix", () => {
    const doc = { type: "doc", content: [{ type: "paragraph" }] };
    expect(toTiptapContent(`  ${JSON.stringify(doc)}  `)).toEqual(doc);
  });
});
