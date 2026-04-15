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
    const stagedId = (path: string) =>
      RichTextStagedFileUtils.STAGED_PATH_ID_PREFIX + path;

    it("rewrites image src to grida-tmp using the staged-path marker in id", () => {
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              src: "https://cdn.example/uploads/cat.png",
              id: stagedId("uploads/cat.png"),
            },
          },
          {
            type: "image",
            attrs: {
              src: "https://cdn.example/uploads/dog.png",
              id: stagedId("uploads/dog.png"),
            },
          },
        ],
      };
      const restaged = RichTextStagedFileUtils.restageDocument(
        doc
      ) as typeof doc;
      expect(restaged.content[0].attrs.src).toBe(tmp("uploads/cat.png"));
      expect(restaged.content[1].attrs.src).toBe(tmp("uploads/dog.png"));
      // id is preserved so the marker survives subsequent round-trips
      expect(restaged.content[0].attrs.id).toBe(stagedId("uploads/cat.png"));
    });

    it("leaves images without a staged marker untouched (external images)", () => {
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              src: "https://external.example/photo.png",
              id: "random_abc",
            },
          },
          {
            type: "image",
            attrs: {
              src: "https://cdn.example/uploads/known.png",
              id: stagedId("uploads/known.png"),
            },
          },
        ],
      };
      const restaged = RichTextStagedFileUtils.restageDocument(
        doc
      ) as typeof doc;
      expect(restaged.content[0].attrs.src).toBe(
        "https://external.example/photo.png"
      );
      expect(restaged.content[1].attrs.src).toBe(tmp("uploads/known.png"));
    });

    it("drops image nodes whose src is a blob: URL (pending uploads are transient)", () => {
      const doc = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "before" }] },
          {
            type: "image",
            attrs: { src: "blob:http://localhost/abc-123", id: "random_id" },
          },
          { type: "paragraph", content: [{ type: "text", text: "after" }] },
        ],
      };
      const restaged = RichTextStagedFileUtils.restageDocument(
        doc
      ) as typeof doc;
      expect(restaged.content).toHaveLength(2);
      expect(restaged.content[0].type).toBe("paragraph");
      expect(restaged.content[1].type).toBe("paragraph");
    });

    it("drops blob: images even if they carry a staged-path marker", () => {
      // A freshly-dropped image might briefly have both — blob src (set by
      // imageAttrsFromFile) and staged id (set after upload resolves). If we
      // see both, the upload hasn't updated src yet so we must still drop it.
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              src: "blob:http://localhost/pending",
              id: stagedId("uploads/not-yet.png"),
            },
          },
        ],
      };
      const restaged = RichTextStagedFileUtils.restageDocument(
        doc
      ) as typeof doc;
      expect(restaged.content).toHaveLength(0);
    });

    it("does not touch non-image nodes that happen to carry src/id attrs", () => {
      const doc = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "hi" }] },
          {
            type: "custom-embed",
            attrs: {
              src: "https://cdn.example/uploads/a.png",
              id: stagedId("uploads/a.png"),
            },
          },
        ],
      };
      const restaged = RichTextStagedFileUtils.restageDocument(
        doc
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
                    attrs: {
                      src: "https://cdn.example/uploads/nested.png",
                      id: stagedId("uploads/nested.png"),
                    },
                  },
                ],
              },
            ],
          },
        ],
      };
      const restaged = RichTextStagedFileUtils.restageDocument(
        doc
      ) as typeof doc;
      const imgNode = restaged.content[0].content![0].content![0];
      expect(imgNode.attrs!.src).toBe(tmp("uploads/nested.png"));
    });

    it("preserves all other image attrs when rewriting src", () => {
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
              id: stagedId("uploads/a.png"),
              fileName: "a.png",
            },
          },
        ],
      };
      const restaged = RichTextStagedFileUtils.restageDocument(
        doc
      ) as typeof doc;
      expect(restaged.content[0].attrs).toEqual({
        src: tmp("uploads/a.png"),
        alt: "a cat",
        title: "cat.png",
        width: 400,
        height: 300,
        id: stagedId("uploads/a.png"),
        fileName: "a.png",
      });
    });

    it("accepts and returns a serialized string when input is a string", () => {
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              src: "https://cdn.example/uploads/s.png",
              id: stagedId("uploads/s.png"),
            },
          },
        ],
      };
      const restaged = RichTextStagedFileUtils.restageDocument(
        JSON.stringify(doc)
      );
      expect(typeof restaged).toBe("string");
      const parsed = JSON.parse(restaged as string);
      expect(parsed.content[0].attrs.src).toBe(tmp("uploads/s.png"));
    });

    it("round-trips with resolveDocument (restage then resolve = display URLs)", async () => {
      // Simulates the reload flow: a draft is saved with grida-tmp src + id
      // marker. On reload, resolveDocument turns grida-tmp into publicUrl for
      // display. On next change, restageDocument uses the id marker to turn
      // publicUrl back into grida-tmp — no session state needed.
      const path = "uploads/rt.png";
      const displayUrl = `https://cdn.example/${path}`;
      const saved = {
        type: "doc",
        content: [
          { type: "image", attrs: { src: tmp(path), id: stagedId(path) } },
        ],
      };
      const resolver = async (file: { path: string }) => ({
        publicUrl: `https://cdn.example/${file.path}`,
      });
      const displayedAfterReload =
        (await RichTextStagedFileUtils.resolveDocument(
          saved,
          resolver
        )) as typeof saved;
      expect(displayedAfterReload.content[0].attrs.src).toBe(displayUrl);

      const serializedOnNextChange = RichTextStagedFileUtils.restageDocument(
        displayedAfterReload
      ) as typeof saved;
      expect(serializedOnNextChange.content[0].attrs.src).toBe(tmp(path));
      expect(serializedOnNextChange.content[0].attrs.id).toBe(stagedId(path));
    });

    it("returns the input doc by reference when nothing needs rewriting (copy-on-write)", () => {
      // Image-free docs run through handleChange on every keystroke, so the
      // walker must not allocate when there's nothing to do.
      const doc = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "plain" }] },
          { type: "paragraph", content: [{ type: "text", text: "text" }] },
        ],
      };
      const restaged = RichTextStagedFileUtils.restageDocument(doc);
      expect(restaged).toBe(doc);
    });

    it("returns input by reference when image has no staged marker and no blob src", () => {
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "https://cdn.example/external.png", id: "xyz" },
          },
        ],
      };
      const restaged = RichTextStagedFileUtils.restageDocument(doc);
      expect(restaged).toBe(doc);
    });

    it("preserves legitimately-undefined attr values (does not drop them)", () => {
      // The drop-node sentinel should only apply inside content arrays,
      // not to object properties that happen to be undefined.
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              src: "https://cdn.example/uploads/a.png",
              id: stagedId("uploads/a.png"),
              width: undefined,
              alt: undefined,
            },
          },
        ],
      };
      const restaged = RichTextStagedFileUtils.restageDocument(
        doc
      ) as typeof doc;
      expect("width" in restaged.content[0].attrs).toBe(true);
      expect("alt" in restaged.content[0].attrs).toBe(true);
      expect(restaged.content[0].attrs.width).toBeUndefined();
      expect(restaged.content[0].attrs.alt).toBeUndefined();
    });

    it("encodeStagedIdAttr / decodeStagedIdAttr round-trip", () => {
      const path = "tmp/abc/def/file.png";
      const encoded = RichTextStagedFileUtils.encodeStagedIdAttr(path);
      expect(RichTextStagedFileUtils.decodeStagedIdAttr(encoded)).toBe(path);
      expect(RichTextStagedFileUtils.decodeStagedIdAttr("random_id")).toBe(
        null
      );
      expect(RichTextStagedFileUtils.decodeStagedIdAttr(null)).toBe(null);
    });
  });
});
