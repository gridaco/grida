import { describe, expect, it } from "vitest";
import { materializeSlideSvgResources } from "./slide-svg-resources";

function testXml() {
  return {
    parse(svg: string) {
      const values: string[] = [];
      const source = svg.replace(/<(image|feImage)\b[^>]*>/gi, (tag: string) =>
        tag.replace(
          /\s(href|xlink:href)="([^"]*)"/g,
          (attr: string, _name: string, value: string) => {
            const index = values.length;
            values.push(value);
            return attr.replace(value, `__grida_attr_${index}__`);
          }
        )
      );
      return {
        attributes() {
          return values.map((value, index) => ({
            value,
            set(next: string) {
              values[index] = next;
            },
          }));
        },
        serialize() {
          return source.replace(/__grida_attr_(\d+)__/g, (_m, index) => {
            return values[Number(index)];
          });
        },
      };
    },
  };
}

const BASE_OPTIONS = {
  workspaceId: "w",
  bundleBasePath: "",
  slideRelPath: "001.svg",
  xml: testXml(),
};

describe("materializeSlideSvgResources", () => {
  it("materializes a relative image href and restores the portable href", async () => {
    const calls: string[] = [];
    const out = await materializeSlideSvgResources(
      '<svg><image href="assets/a.png"/></svg>',
      {
        ...BASE_OPTIONS,
        readFileBytes: async (_workspaceId, relPath) => {
          calls.push(relPath);
          return { base64: "AAAA" };
        },
      }
    );

    expect(calls).toEqual(["assets/a.png"]);
    expect(out.svg).toContain('href="data:image/png;grida-svg-resource=');
    expect(out.svg).toContain(';base64,AAAA"');
    expect(out.restore(out.svg)).toBe(
      '<svg><image href="assets/a.png"/></svg>'
    );
  });

  it("handles xlink image carriers", async () => {
    const calls: string[] = [];
    const out = await materializeSlideSvgResources(
      '<svg><image xlink:href="assets/a.jpg"/><feImage href="assets/filter.webp"/></svg>',
      {
        ...BASE_OPTIONS,
        readFileBytes: async (_workspaceId, relPath) => {
          calls.push(relPath);
          return { base64: relPath.endsWith(".jpg") ? "JPEG" : "WEBP" };
        },
      }
    );

    expect(calls).toEqual(["assets/a.jpg", "assets/filter.webp"]);
    expect(out.svg).toContain(
      'xlink:href="data:image/jpeg;grida-svg-resource='
    );
    expect(out.svg).toContain('href="data:image/webp;grida-svg-resource=');
    expect(out.svg).toContain(";base64,JPEG");
    expect(out.svg).toContain(";base64,WEBP");
    expect(out.restore(out.svg)).toBe(
      '<svg><image xlink:href="assets/a.jpg"/><feImage href="assets/filter.webp"/></svg>'
    );
  });

  it("does not rewrite absolute or self-contained hrefs", async () => {
    const svg =
      '<svg><image href="data:image/png;base64,AUTHORED"/><image href="blob:https://example.com/x"/><image href="https://example.com/a.png"/><image href="file:///tmp/a.png"/><image href="#paint"/></svg>';
    const out = await materializeSlideSvgResources(svg, {
      ...BASE_OPTIONS,
      readFileBytes: async () => {
        throw new Error("should not read");
      },
    });

    expect(out.svg).toBe(svg);
    expect(out.restore(svg)).toBe(svg);
  });

  it("allows parent traversal only inside the canvas bundle root", async () => {
    const calls: string[] = [];
    const out = await materializeSlideSvgResources(
      '<svg><image href="../assets/a.png"/><image href="../../outside.png"/></svg>',
      {
        ...BASE_OPTIONS,
        bundleBasePath: "deck.canvas",
        slideRelPath: "deck.canvas/slides/001.svg",
        readFileBytes: async (_workspaceId, relPath) => {
          calls.push(relPath);
          return { base64: "AAAA" };
        },
      }
    );

    expect(calls).toEqual(["deck.canvas/assets/a.png"]);
    expect(out.svg).toContain("data:image/png;grida-svg-resource=");
    expect(out.svg).toContain('href="../../outside.png"');
  });

  it("leaves an href unchanged when the asset read fails", async () => {
    const out = await materializeSlideSvgResources(
      '<svg><image href="assets/missing.png"/></svg>',
      {
        ...BASE_OPTIONS,
        readFileBytes: async () => {
          throw new Error("missing");
        },
      }
    );

    expect(out.svg).toBe('<svg><image href="assets/missing.png"/></svg>');
  });

  it("restores only generated data urls", async () => {
    const out = await materializeSlideSvgResources(
      '<svg><image href="assets/a.png"/></svg>',
      {
        ...BASE_OPTIONS,
        readFileBytes: async () => ({ base64: "AAAA" }),
      }
    );

    expect(
      out.restore('<svg><image href="data:image/png;base64,AUTHORED"/></svg>')
    ).toBe('<svg><image href="data:image/png;base64,AUTHORED"/></svg>');
    expect(out.restore(out.svg)).toBe(
      '<svg><image href="assets/a.png"/></svg>'
    );
  });
});
