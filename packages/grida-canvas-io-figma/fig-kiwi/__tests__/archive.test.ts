import { readFigFile } from "../index";
import { readFileSync } from "fs";

test("it should parse empty file", () => {
  const data = readFileSync(__dirname + "/../../../../fixtures/test-fig/L0/blank.fig");
  const parsed = readFigFile(data);
  expect(parsed.header).toBeDefined();
  expect(parsed.schema).toBeDefined();
  expect(parsed.message).toBeDefined();
});

test("realworld files assertion", () => {
  const communityFiles = [
    "community/1380235722331273046-figma-simple-design-system.fig",
    "community/1510053249065427020-workos-radix-icons.fig",
    "community/1527721578857867021-apple-ios-26.fig",
    "community/784448220678228461-figma-auto-layout playground.fig",
  ];
  
  communityFiles.forEach(filename => {
    const data = readFileSync(__dirname + `/../../../../fixtures/test-fig/${filename}`);
    const parsed = readFigFile(data);
    expect(parsed.header).toBeDefined();
    expect(parsed.schema).toBeDefined();
    expect(parsed.message).toBeDefined();
  });
});
