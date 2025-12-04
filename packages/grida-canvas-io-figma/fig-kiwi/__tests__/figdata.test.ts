import { FigmaArchiveParser, FigmaArchiveWriter, readFigFile } from "../index";
import { readFileSync, writeFileSync } from "fs";
import {
  compileSchema,
  decodeBinarySchema,
  compileSchemaTypeScript,
  prettyPrintSchema,
  encodeBinarySchema,
} from "kiwi-schema";
import schema from "../schema";
import { Schema as CompiledSchema, NodeChange, Message } from "../schema";
import { deflateSync, inflateSync } from "fflate";

test.skip("this just formats the schema", () => {
  const prettySchema = prettyPrintSchema(schema);
  writeFileSync(__dirname + "/fig.kiwi", prettySchema);
});

test("able to parse figma kiwi", () => {
  const data = readFileSync(
    __dirname + "/../../../../fixtures/test-fig/L0/blank.fig"
  );
  const parsed = readFigFile(data);
  expect(parsed.header.version).toBeGreaterThanOrEqual(15);
  expect(parsed.schema).toHaveProperty("definitions");
  expect(parsed.message).not.toBeNull();
});

test("realworld files assertion", () => {
  const communityFiles = [
    "1380235722331273046-figma-simple-design-system.fig",
    "1510053249065427020-workos-radix-icons.fig",
    "1527721578857867021-apple-ios-26.fig",
    "784448220678228461-figma-auto-layout playground.fig",
  ];

  communityFiles.forEach((filename) => {
    const data = readFileSync(
      __dirname + `/../../../../fixtures/test-fig/community/${filename}`
    );
    const parsed = readFigFile(data);
    expect(parsed.message).toBeDefined();
    expect(parsed.schema).toBeDefined();
  });
});

test("parsed message has expected structure", () => {
  const data = readFileSync(
    __dirname + "/../../../../fixtures/test-fig/L0/blank.fig"
  );
  const parsed = readFigFile(data);
  expect(parsed.message).toBeDefined();
  expect(parsed.schema).toBeDefined();
  expect(parsed.header).toBeDefined();
});

test("able to enc dec a known message", () => {
  const cs = compileSchema(schema) as unknown as CompiledSchema;
  const message: NodeChange = { guid: { sessionID: 123, localID: 321 } };
  const data = cs.encodeNodeChange(message);
  const decoded = cs.decodeNodeChange(data);
  expect(decoded).toEqual(message);
});

test("able to write dummy files to a fig-kiwi archive", () => {
  const encoder = new FigmaArchiveWriter();
  const expectedFiles = [
    new Uint8Array([128, 1, 2, 3, 4, 5]),
    new Uint8Array([256, 5, 6, 7, 8, 23, 11]),
  ];
  encoder.files = expectedFiles;
  const archive = encoder.write();

  // Now decode and verify
  const { header, files } = FigmaArchiveParser.parseArchive(archive);
  expect(files).toEqual(expectedFiles);
  expect(header).toEqual(encoder.header);
});

// test.skip("able to write a Message to an archive", () => {
//   // @ts-ignore
//   const binSchema = encodeBinarySchema(schema);
//   const compiledSchema = compileSchema(schema) as unknown as CompiledSchema;
//   const message: SparseMessage = JSON.parse(
//     readFileSync(__dirname + "/../data/grey-circle-paste.json", {
//       encoding: "utf8",
//     })
//   );
//   const encoder = new FigmaArchiveWriter();
//   encoder.files = [
//     deflateSync(binSchema),
//     deflateSync(compiledSchema.encodeMessage(message)),
//   ];
//   const data = encoder.write();
//   writeFileSync(__dirname + "/../data/grey-circle-paste-generated.fig", data);
// });
