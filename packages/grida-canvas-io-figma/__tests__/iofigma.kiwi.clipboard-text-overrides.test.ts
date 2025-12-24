import { iofigma } from "../lib";

describe("iofigma.kiwi flattenInstances text overrides (mocked)", () => {
  it("applies symbolOverrides textData.characters to matching TEXT node by guid", () => {
    // NEED REAL FIXTURE:
    // This test uses a handcrafted minimal NodeChanges payload (not captured from Figma).
    // It validates the override-application logic in isolation, but should be replaced
    // with a real clipboard fixture once we have one that includes a text override.
    const docGuid = { sessionID: 0, localID: 0 };
    const pageGuid = { sessionID: 0, localID: 1 };
    const internalGuid = { sessionID: 20000010, localID: 0 };

    const symbolGuid = { sessionID: 1, localID: 11 };
    const textGuid = { sessionID: 1, localID: 12 };
    const instGuid = { sessionID: 1, localID: 20 };

    // Minimal Kiwi nodeChanges to build:
    // DOCUMENT -> CANVAS(Page) + CANVAS(InternalOnly)
    // InternalOnly -> SYMBOL -> TEXT
    // Page -> INSTANCE(symbolID -> SYMBOL) with symbolOverrides targeting TEXT guid
    const nodeChanges: any[] = [
      { type: "DOCUMENT", guid: docGuid, name: "Document" },
      {
        type: "CANVAS",
        guid: pageGuid,
        name: "Page 1",
        parentIndex: { guid: docGuid, position: "!" },
      },
      {
        type: "CANVAS",
        guid: internalGuid,
        name: "Internal Only Canvas",
        internalOnly: true,
        parentIndex: { guid: docGuid, position: "~" },
      },
      {
        type: "SYMBOL",
        guid: symbolGuid,
        name: "Component",
        size: { x: 100, y: 100 },
        parentIndex: { guid: internalGuid, position: "!" },
      },
      {
        type: "TEXT",
        guid: textGuid,
        name: "Label",
        size: { x: 100, y: 20 },
        parentIndex: { guid: symbolGuid, position: "!" },
        textData: { characters: "ORIGINAL" },
      },
      {
        type: "INSTANCE",
        guid: instGuid,
        name: "Instance",
        size: { x: 100, y: 100 },
        parentIndex: { guid: pageGuid, position: "!" },
        symbolData: {
          symbolID: symbolGuid,
          symbolOverrides: [
            {
              type: "TEXT",
              guid: textGuid,
              textData: { characters: "OVERRIDDEN" },
            },
          ],
        },
      },
    ];

    const message: any = { nodeChanges, blobs: [] };

    const roots = iofigma.kiwi.buildClipboardRootNodes({
      nodeChanges,
      message,
      options: { flattenInstances: true },
    });

    expect(roots.length).toBe(1);
    expect((roots[0] as any).type).toBe("INSTANCE");

    const inst: any = roots[0];
    expect(Array.isArray(inst.children)).toBe(true);

    const textNode = (inst.children as any[]).find((n) => n.type === "TEXT");
    expect(textNode).toBeDefined();
    expect(textNode.characters).toBe("OVERRIDDEN");
  });
});
