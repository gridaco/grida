import { v4 } from "uuid";
import { FormValue, RichTextStagedFileUtils } from "./utils";

const id_b = v4();
const id_d = v4();
const enums = [
  { id: v4(), value: "A" },
  { id: id_b, value: "B" },
  { id: v4(), value: "C" },
  { id: id_d, value: "D" },
];

describe("FormValue.parse", () => {
  it("should parse numeric field value", () => {
    const numeric = FormValue.parse(1, { type: "number" });
    expect(numeric).toEqual({ value: 1 });
    const numericstring = FormValue.parse("1", { type: "number" });
    expect(numericstring).toEqual({ value: 1 });
  });

  it("should parse boolean field value - switch", () => {
    const bool = FormValue.parse(true, { type: "switch" });
    expect(bool).toEqual({ value: true });
    const boolstring = FormValue.parse("on", { type: "switch" });
    expect(boolstring).toEqual({ value: true });
    const boolstringoff = FormValue.parse("off", { type: "switch" });
    expect(boolstringoff).toEqual({ value: false });
  });

  it("should parse boolean field value - checkbox", () => {
    const bool = FormValue.parse(true, { type: "checkbox" });
    expect(bool).toEqual({ value: true });
    const boolstring = FormValue.parse("on", { type: "checkbox" });
    expect(boolstring).toEqual({ value: true });
    const boolstringoff = FormValue.parse("off", { type: "checkbox" });
    expect(boolstringoff).toEqual({ value: false });
  });

  it("should parse enum value - select", () => {
    const parsed = FormValue.parse(id_b, {
      type: "select",
      enums: enums,
    });

    expect(parsed).toEqual({ value: "B", enum_id: id_b });
  });

  it("should parse enum value - toggle group [type=single]", () => {
    const valid = FormValue.parse(id_b, {
      type: "toggle-group",
      enums: enums,
      multiple: false,
    });

    expect(valid).toEqual({ value: "B", enum_id: id_b });
  });

  it("should NOT parse enum value - toggle group [type=single] but [value=array]", () => {
    const valid = FormValue.parse([id_b], {
      type: "toggle-group",
      enums: enums,
      multiple: false,
    });

    expect(valid.enum_id).toEqual(null);
    expect(valid.enum_ids).toEqual(undefined);
  });

  it("should parse enum value - toggle group [type=multiple]", () => {
    const one_selected_no_comma = FormValue.parse(`${id_b}`, {
      type: "toggle-group",
      enums: enums,
      multiple: true,
    });

    expect(one_selected_no_comma).toEqual({ value: ["B"], enum_ids: [id_b] });

    const one_selected_with_comma = FormValue.parse(`${id_b},`, {
      type: "toggle-group",
      enums: enums,
      multiple: true,
    });

    expect(one_selected_with_comma).toEqual({ value: ["B"], enum_ids: [id_b] });

    const two_selected = FormValue.parse(`${id_b},${id_d}`, {
      type: "toggle-group",
      enums: enums,
      multiple: true,
    });

    expect(two_selected).toEqual({ value: ["B", "D"], enum_ids: [id_b, id_d] });
  });

  it("should parse enum value - toggle group [type=multiple] [value=array]", () => {
    const one_selected_no_comma = FormValue.parse([id_b], {
      type: "toggle-group",
      enums: enums,
      multiple: true,
    });

    expect(one_selected_no_comma).toEqual({ value: ["B"], enum_ids: [id_b] });

    const two_selected = FormValue.parse([id_b, id_d], {
      type: "toggle-group",
      enums: enums,
      multiple: true,
    });

    expect(two_selected).toEqual({ value: ["B", "D"], enum_ids: [id_b, id_d] });
  });
});

describe("RichTextStagedFileUtils", () => {
  const tmp = (path: string) => `grida-tmp://${path}?grida-tmp=true`;

  describe("parseDocument", () => {
    it("extracts staged file paths from a serialized tiptap doc", () => {
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: tmp("folder/a.png") },
          },
          {
            type: "image",
            attrs: { src: tmp("folder/b.png") },
          },
          {
            type: "image",
            attrs: { src: "https://cdn.example/already-resolved.png" },
          },
        ],
      };
      const { staged_file_paths } = RichTextStagedFileUtils.parseDocument(doc);
      expect(staged_file_paths).toEqual(["folder/a.png", "folder/b.png"]);
    });

    it("returns empty array when no staged URLs are present", () => {
      const doc = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "hi" }] },
        ],
      };
      const { staged_file_paths } = RichTextStagedFileUtils.parseDocument(doc);
      expect(staged_file_paths).toEqual([]);
    });
  });

  describe("resolveDocument", () => {
    it("rewrites grida-tmp URLs to their resolved publicUrls", async () => {
      const doc = {
        type: "doc",
        content: [
          { type: "image", attrs: { src: tmp("uploads/cat.png") } },
          { type: "image", attrs: { src: tmp("uploads/dog.png") } },
        ],
      };
      const resolver = async (file: { path: string }) => ({
        publicUrl: `https://cdn.example/${file.path}`,
      });
      const resolved = (await RichTextStagedFileUtils.resolveDocument(
        doc,
        resolver
      )) as typeof doc;
      expect(resolved.content[0].attrs.src).toBe(
        "https://cdn.example/uploads/cat.png"
      );
      expect(resolved.content[1].attrs.src).toBe(
        "https://cdn.example/uploads/dog.png"
      );
    });

    it("returns the doc unchanged when there are no staged URLs", async () => {
      const doc = {
        type: "doc",
        content: [{ type: "paragraph" }],
      };
      const resolver = async () => ({ publicUrl: "should-not-be-called" });
      const resolved = await RichTextStagedFileUtils.resolveDocument(
        doc,
        resolver
      );
      expect(resolved).toBe(doc);
    });

    it("calls resolver once per unique path", async () => {
      const doc = {
        type: "doc",
        content: [
          { type: "image", attrs: { src: tmp("a.png") } },
          { type: "image", attrs: { src: tmp("a.png") } },
          { type: "image", attrs: { src: tmp("b.png") } },
        ],
      };
      const calls: string[] = [];
      const resolver = async (file: { path: string }) => {
        calls.push(file.path);
        return { publicUrl: `https://cdn.example/${file.path}` };
      };
      await RichTextStagedFileUtils.resolveDocument(doc, resolver);
      expect(calls.sort()).toEqual(["a.png", "b.png"]);
    });

    it("leaves unresolved paths in place when resolver returns null", async () => {
      const doc = {
        type: "doc",
        content: [
          { type: "image", attrs: { src: tmp("missing.png") } },
          { type: "image", attrs: { src: tmp("ok.png") } },
        ],
      };
      const resolver = async (file: { path: string }) =>
        file.path === "ok.png"
          ? { publicUrl: `https://cdn.example/ok.png` }
          : null;
      const resolved = (await RichTextStagedFileUtils.resolveDocument(
        doc,
        resolver
      )) as typeof doc;
      expect(resolved.content[0].attrs.src).toBe(tmp("missing.png"));
      expect(resolved.content[1].attrs.src).toBe("https://cdn.example/ok.png");
    });

    it("leaves unresolved paths in place when resolver throws", async () => {
      const doc = {
        type: "doc",
        content: [{ type: "image", attrs: { src: tmp("boom.png") } }],
      };
      const resolver = async () => {
        throw new Error("network");
      };
      const resolved = (await RichTextStagedFileUtils.resolveDocument(
        doc,
        resolver
      )) as typeof doc;
      expect(resolved.content[0].attrs.src).toBe(tmp("boom.png"));
    });

    it("accepts and returns a serialized string when input is a string", async () => {
      const doc = {
        type: "doc",
        content: [{ type: "image", attrs: { src: tmp("x.png") } }],
      };
      const resolver = async (file: { path: string }) => ({
        publicUrl: `https://cdn.example/${file.path}`,
      });
      const resolved = await RichTextStagedFileUtils.resolveDocument(
        JSON.stringify(doc),
        resolver
      );
      expect(typeof resolved).toBe("string");
      const parsed = JSON.parse(resolved as string);
      expect(parsed.content[0].attrs.src).toBe("https://cdn.example/x.png");
    });
  });

  describe("restageDocument", () => {
    it("rewrites known display URLs back to grida-tmp form", () => {
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "https://cdn.example/uploads/cat.png" },
          },
          {
            type: "image",
            attrs: { src: "https://cdn.example/uploads/dog.png" },
          },
        ],
      };
      const pathByUrl = new Map([
        ["https://cdn.example/uploads/cat.png", "uploads/cat.png"],
        ["https://cdn.example/uploads/dog.png", "uploads/dog.png"],
      ]);
      const restaged = RichTextStagedFileUtils.restageDocument(doc, pathByUrl);
      expect(restaged).toEqual({
        type: "doc",
        content: [
          { type: "image", attrs: { src: tmp("uploads/cat.png") } },
          { type: "image", attrs: { src: tmp("uploads/dog.png") } },
        ],
      });
    });

    it("leaves unknown URLs untouched", () => {
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "https://external.example/photo.png" },
          },
          {
            type: "image",
            attrs: { src: "https://cdn.example/uploads/known.png" },
          },
        ],
      };
      const pathByUrl = new Map([
        ["https://cdn.example/uploads/known.png", "uploads/known.png"],
      ]);
      const restaged = RichTextStagedFileUtils.restageDocument(doc, pathByUrl);
      expect((restaged as typeof doc).content[0].attrs.src).toBe(
        "https://external.example/photo.png"
      );
      expect((restaged as typeof doc).content[1].attrs.src).toBe(
        tmp("uploads/known.png")
      );
    });

    it("is a no-op when the map is empty", () => {
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "https://cdn.example/uploads/any.png" },
          },
        ],
      };
      const restaged = RichTextStagedFileUtils.restageDocument(doc, new Map());
      expect(restaged).toBe(doc);
    });

    it("does not touch non-image nodes with matching src-like attrs", () => {
      // Sanity check: a hypothetical node type that happens to carry a `src`
      // attribute should not be rewritten — only `type: "image"` is in scope.
      const doc = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "hi" }] },
          {
            type: "custom-embed",
            attrs: { src: "https://cdn.example/uploads/a.png" },
          },
        ],
      };
      const pathByUrl = new Map([
        ["https://cdn.example/uploads/a.png", "uploads/a.png"],
      ]);
      const restaged = RichTextStagedFileUtils.restageDocument(
        doc,
        pathByUrl
      ) as typeof doc;
      expect(restaged.content[1].attrs!.src).toBe(
        "https://cdn.example/uploads/a.png"
      );
    });

    it("walks nested structures (image inside a wrapper node)", () => {
      const doc = {
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "image",
                    attrs: { src: "https://cdn.example/uploads/nested.png" },
                  },
                ],
              },
            ],
          },
        ],
      };
      const pathByUrl = new Map([
        ["https://cdn.example/uploads/nested.png", "uploads/nested.png"],
      ]);
      const restaged = RichTextStagedFileUtils.restageDocument(
        doc,
        pathByUrl
      ) as typeof doc;
      const imgNode = restaged.content[0].content![0].content![0];
      expect(imgNode.attrs!.src).toBe(tmp("uploads/nested.png"));
    });

    it("preserves other image attrs when rewriting src", () => {
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              src: "https://cdn.example/uploads/a.png",
              alt: "a cat",
              title: "cat.png",
              width: 400,
              height: 300,
              id: "img_1",
            },
          },
        ],
      };
      const pathByUrl = new Map([
        ["https://cdn.example/uploads/a.png", "uploads/a.png"],
      ]);
      const restaged = RichTextStagedFileUtils.restageDocument(
        doc,
        pathByUrl
      ) as typeof doc;
      expect(restaged.content[0].attrs).toEqual({
        src: tmp("uploads/a.png"),
        alt: "a cat",
        title: "cat.png",
        width: 400,
        height: 300,
        id: "img_1",
      });
    });

    it("accepts and returns a serialized string when input is a string", () => {
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "https://cdn.example/uploads/s.png" },
          },
        ],
      };
      const pathByUrl = new Map([
        ["https://cdn.example/uploads/s.png", "uploads/s.png"],
      ]);
      const restaged = RichTextStagedFileUtils.restageDocument(
        JSON.stringify(doc),
        pathByUrl
      );
      expect(typeof restaged).toBe("string");
      const parsed = JSON.parse(restaged as string);
      expect(parsed.content[0].attrs.src).toBe(tmp("uploads/s.png"));
    });

    it("round-trips with resolveDocument (restage then resolve = original display URLs)", async () => {
      const displayUrl = "https://cdn.example/uploads/rt.png";
      const path = "uploads/rt.png";
      const doc = {
        type: "doc",
        content: [{ type: "image", attrs: { src: displayUrl } }],
      };
      const pathByUrl = new Map([[displayUrl, path]]);
      const restaged = RichTextStagedFileUtils.restageDocument(
        doc,
        pathByUrl
      ) as typeof doc;
      const resolver = async (file: { path: string }) => ({
        publicUrl: `https://cdn.example/${file.path}`,
      });
      const resolved = (await RichTextStagedFileUtils.resolveDocument(
        restaged,
        resolver
      )) as typeof doc;
      expect(resolved.content[0].attrs.src).toBe(displayUrl);
    });
  });
});
