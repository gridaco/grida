import { readFileSync, writeFileSync } from "fs";
import {
  parseHTMLString,
  FigmaArchiveParser,
  writeHTMLMessage,
  readHTMLMessage,
} from "../index";
import { compileSchema, decodeBinarySchema } from "kiwi-schema";
import { Message, NodeChange, Schema as CompiledSchema } from "../schema";
import { inflateSync } from "fflate";
import schema from "../schema";

test("parses components from html string", () => {
  const str = readFileSync(
    __dirname +
      "/../../../../fixtures/test-fig/clipboard/ellipse-circle-100x100-black.clipbaord.html",
    {
      encoding: "utf-8",
    }
  );

  const { figma, meta } = parseHTMLString(str);

  expect(meta).toEqual({
    fileKey: "YrxS8WHCD0GRbo3rfcrLsD",
    pasteID: 909736251,
    dataType: "scene",
  });

  expect(figma.byteLength).toBeGreaterThan(1000);

  const parsed = FigmaArchiveParser.parseArchive(figma);
  expect(parsed.files.length).toBe(2);

  const [schemaFile, dataFile] = parsed.files;
  const fileSchema = decodeBinarySchema(inflateSync(schemaFile));

  const cs = compileSchema(fileSchema) as unknown as CompiledSchema;

  const message: Message = cs.decodeMessage(inflateSync(dataFile));
  expect(message).toBeDefined();
  expect(message.nodeChanges).toBeDefined();
  expect(Array.isArray(message.nodeChanges)).toBe(true);
});

test("parses multiple clipboard formats", () => {
  const clipboardFiles = [
    { file: "ellipse-circle-100x100-black.clipbaord.html", pasteID: 909736251 },
    { file: "rect-square-100x100-black.clipboard.html", pasteID: 2041389239 },
    { file: "star-5-40-100x100-black.clipboard.html", pasteID: 372157327 },
  ];

  clipboardFiles.forEach(({ file, pasteID }) => {
    const str = readFileSync(
      __dirname + `/../../../../fixtures/test-fig/clipboard/${file}`,
      {
        encoding: "utf-8",
      }
    );

    const { figma, meta } = parseHTMLString(str);

    expect(meta).toEqual({
      fileKey: "YrxS8WHCD0GRbo3rfcrLsD",
      pasteID,
      dataType: "scene",
    });

    expect(figma.byteLength).toBeGreaterThan(1000);

    const parsed = FigmaArchiveParser.parseArchive(figma);
    expect(parsed.files.length).toBe(2);

    const [schemaFile, dataFile] = parsed.files;
    const fileSchema = decodeBinarySchema(inflateSync(schemaFile));

    const cs = compileSchema(fileSchema) as CompiledSchema;

    const message: Message = cs.decodeMessage(inflateSync(dataFile));
    expect(message).toBeDefined();
    expect(message.nodeChanges).toBeDefined();
    expect(Array.isArray(message.nodeChanges)).toBe(true);
  });
});

test.skip("write canned message to html", () => {
  const message: Message = JSON.parse(
    readFileSync(__dirname + "/../data/grey-circle-paste.json", {
      encoding: "utf8",
    })
  );

  const html = writeHTMLMessage({
    meta: { fileKey: "abcd", pasteID: 0, dataType: "scene" },
    schema: schema as unknown as CompiledSchema,
    message,
  });

  writeFileSync(__dirname + "/../gen/grey-circle-regen.html", html);
  expect(html).toMatchSnapshot();
});

test("write html string", () => {
  const nodeToCreate: NodeChange = {
    guid: {
      sessionID: 13,
      localID: 2,
    },
    phase: "CREATED",
    parentIndex: {
      guid: {
        sessionID: 0,
        localID: 1,
      },
      position: "!",
    },
    type: "ELLIPSE",
    name:
      "Butterfucker " +
      Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
        Math.random() * 1000
      ),
    visible: true,
    locked: false,
    opacity: 1,
    size: {
      x: 310,
      y: 310,
    },
    fillPaints: [
      {
        type: "SOLID",
        color: {
          r: Math.random(),
          g: Math.random(),
          b: Math.random(),
          a: 1,
        },
        opacity: 1,
        visible: true,
        blendMode: "NORMAL",
      },
    ],
  };

  const message: Message = {
    type: "NODE_CHANGES",
    sessionID: 0,
    ackID: 0,
    pasteID: 1180497570,
    pasteFileKey: "vDQhnT3wvDCl0P7UjANY7L",
    pasteIsPartiallyOutsideEnclosingFrame: false,
    pastePageId: {
      sessionID: 0,
      localID: 1,
    },
    isCut: false,
    pasteEditorType: "DESIGN",
    nodeChanges: [
      {
        guid: {
          sessionID: 0,
          localID: 1,
        },
        phase: "CREATED",
        parentIndex: {
          guid: {
            sessionID: 0,
            localID: 0,
          },
          position: "!",
        },
        type: "CANVAS",
        name: "Page 1",
        visible: true,
        opacity: 1,
        blendMode: "PASS_THROUGH",
        transform: {
          m00: 1,
          m01: 0,
          m02: 0,
          m10: 0,
          m11: 1,
          m12: 0,
        },
        backgroundEnabled: true,
        mask: false,
        maskIsOutline: false,
        backgroundOpacity: 1,
        backgroundColor: {
          r: 0.11764705926179886,
          g: 0.11764705926179886,
          b: 0.11764705926179886,
          a: 1,
        },
        exportBackgroundDisabled: false,
      },
      nodeToCreate,
    ],
  };

  const html = writeHTMLMessage({
    meta: { fileKey: "abcd", pasteID: 1234, dataType: "scene" },
    schema: schema as unknown as CompiledSchema,
    message,
  });

  expect(html).not.toBeNull();
  expect(html).toContain("data-metadata");
  expect(html).toContain("data-buffer");
  expect(html).toContain("figmeta");
  expect(html).toContain("figma");

  const rt = readHTMLMessage(html);
  expect(rt.meta).toBeDefined();
  expect(rt.message).toBeDefined();
  expect(rt.message.type).toBe("NODE_CHANGES");
});
