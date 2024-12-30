import mixed from "./index";

describe("mixed function", () => {
  it("should compute mixed properties correctly for given objects", () => {
    const objects = [
      {
        id: "a",
        type: "rect",
        locked: false,
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        opacity: 1,
        fill: "red",
        stroke: "black",
        strokeWidth: 2,
      },
      {
        id: "b",
        type: "circle",
        locked: false,
        cx: 50,
        cy: 50,
        r: 50,
        opacity: 1,
        fill: "blue",
        stroke: "black",
        strokeWidth: 2,
      },
      {
        id: "c",
        type: "text",
        locked: false,
        x: 10,
        y: 10,
        opacity: 0,
        text: "Hello World",
        fill: "black",
        font: "Arial",
      },
    ];

    const result = mixed(objects, {
      idKey: "id",
      ignoredKeys: ["id", "type"],
      mixed: null,
    });

    expect(result).toEqual({
      locked: {
        type: "boolean",
        value: false,
        mixed: false,
        partial: false,
        ids: ["a", "b", "c"],
      },
      x: {
        type: "number",
        value: 10,
        mixed: false,
        partial: true,
        ids: ["a", "c"],
      },
      y: {
        type: "number",
        value: 10,
        mixed: false,
        partial: true,
        ids: ["a", "c"],
      },
      cx: {
        type: "number",
        value: 50,
        mixed: false,
        partial: true,
        ids: ["b"],
      },
      cy: {
        type: "number",
        value: 50,
        mixed: false,
        partial: true,
        ids: ["b"],
      },
      width: {
        type: "number",
        value: 100,
        mixed: false,
        partial: true,
        ids: ["a"],
      },
      height: {
        type: "number",
        value: 100,
        mixed: false,
        partial: true,
        ids: ["a"],
      },
      opacity: {
        type: "number",
        value: null,
        mixed: true,
        partial: false,
        ids: ["a", "b", "c"],
      },
      fill: {
        type: "string",
        value: null,
        mixed: true,
        partial: false,
        ids: ["a", "b", "c"],
      },
      stroke: {
        type: "string",
        value: "black",
        mixed: false,
        partial: true,
        ids: ["a", "b"],
      },
      strokeWidth: {
        type: "number",
        value: 2,
        mixed: false,
        partial: true,
        ids: ["a", "b"],
      },
      text: {
        type: "string",
        value: "Hello World",
        mixed: false,
        partial: true,
        ids: ["c"],
      },
      font: {
        type: "string",
        value: "Arial",
        mixed: false,
        partial: true,
        ids: ["c"],
      },
      r: {
        type: "number",
        value: 50,
        mixed: false,
        partial: true,
        ids: ["b"],
      },
    });
  });

  it("should return an empty result for an empty input array", () => {
    const result = mixed([], { idKey: "id", mixed: null });
    expect(result).toEqual({});
  });

  it("should ignore specified keys", () => {
    const objects = [
      { id: "a", type: "rect", x: 10 },
      { id: "b", type: "circle", x: 20 },
    ];
    const result = mixed(objects, {
      idKey: "id",
      ignoredKeys: ["id", "type", "x"],
      mixed: null,
    });
    expect(result).toEqual({});
  });

  it("should handle arrays and complex types gracefully", () => {
    const objects = [
      { id: "a", tags: ["red", "blue"], count: 10 },
      { id: "b", tags: ["green"], count: 10 },
    ];
    const result = mixed(objects, { idKey: "id", mixed: null });

    expect(result.tags).toEqual({
      type: undefined,
      value: null,
      mixed: true,
      partial: false,
      ids: ["a", "b"],
    });

    expect(result.count).toEqual({
      type: "number",
      value: 10,
      mixed: false,
      partial: false,
      ids: ["a", "b"],
    });
  });
});
