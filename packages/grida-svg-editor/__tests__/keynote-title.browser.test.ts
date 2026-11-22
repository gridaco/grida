import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { createSvgEditor } from "../src";
import { attach_dom_surface, type DomSurfaceHandle } from "../src/dom";
import { keynote } from "../src/presets";
import { clientCenter, nodeIdByName, pointer } from "./_browser-helpers";

const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
  <title id="slide-title">Overview</title>
  <g id="card">
    <title>Details</title>
    <rect id="plot" role="img" x="30" y="40" width="110" height="80" fill="blue"><title>Quarterly plot</title></rect>
  </g>
  <circle id="badge" role="img" aria-label="New" cx="220" cy="80" r="30"><title>Badge tooltip</title></circle>
  <rect id="summary" role="img" aria-labelledby="summary-title" aria-label="Fallback" x="300" y="40" width="70" height="80"><title id="summary-title">Summary</title></rect>
</svg>`;

function mount(
  attach: (
    editor: ReturnType<typeof createSvgEditor>,
    container: HTMLElement
  ) => DomSurfaceHandle
) {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "900px",
    height: "650px",
  });
  document.body.append(container);
  const editor = createSvgEditor({ svg: svgSource });
  const handle = attach(editor, container);
  return {
    container,
    editor,
    dispose() {
      handle.detach();
      editor.dispose();
      container.remove();
    },
  };
}

it("keeps title names, ARIA references, and pointer targeting without native title elements", () => {
  const { container, editor, dispose } = mount((editor, container) =>
    keynote.attach(editor, { container })
  );
  try {
    const svg = container.querySelector("svg")!;
    const plot = svg.getElementById("plot")!;
    expect(svg.querySelectorAll("title")).toHaveLength(0);
    expect(svg.getAttribute("aria-label")).toBe("Overview");
    expect(svg.getElementById("card")?.getAttribute("aria-label")).toBe(
      "Details"
    );
    expect(
      page.getByRole("img", { name: "Quarterly plot", exact: true }).element()
    ).toBe(plot);
    expect(page.getByRole("img", { name: "New", exact: true }).element()).toBe(
      svg.getElementById("badge")
    );
    expect(
      page.getByRole("img", { name: "Summary", exact: true }).element()
    ).toBe(svg.getElementById("summary"));
    expect(svg.getElementById("summary")?.getAttribute("aria-label")).toBe(
      "Fallback"
    );
    expect(svg.getElementById("summary-title")?.textContent).toBe("Summary");
    expect(editor.serialize()).toBe(svgSource);

    const id = nodeIdByName(editor, "plot");
    expect(editor.geometry.bounds_of(id)).toEqual({
      x: 30,
      y: 40,
      width: 110,
      height: 80,
    });
    const { x, y } = clientCenter(plot);
    pointer(container, "pointermove", x, y, 0, { metaKey: true });
    pointer(container, "pointerdown", x, y, 1, { metaKey: true });
    pointer(window, "pointerup", x, y, 0, { metaKey: true });
    expect(editor.state.selection).toEqual([id]);

    const next = svgSource.replace("Quarterly plot", "Annual plot");
    editor.load(next);
    expect(container.querySelectorAll("svg title")).toHaveLength(0);
    expect(
      page.getByRole("img", { name: "Annual plot", exact: true }).element()
    ).toBe(container.querySelector("#plot"));
    expect(editor.serialize()).toBe(next);
  } finally {
    dispose();
  }
});

it("keeps native SVG titles in the ordinary DOM surface and when explicitly enabled in Keynote", () => {
  const attachments = [
    (editor, container) => attach_dom_surface(editor, { container }),
    (editor, container) =>
      keynote.attach(editor, {
        container,
        surface: { native_title_tooltips: true },
      }),
  ] satisfies Parameters<typeof mount>[0][];
  for (const attach of attachments) {
    const { container, editor, dispose } = mount(attach);
    try {
      expect(container.querySelectorAll("svg title")).toHaveLength(5);
      expect(container.querySelector("svg")?.hasAttribute("aria-label")).toBe(
        false
      );
      expect(editor.serialize()).toBe(svgSource);
    } finally {
      dispose();
    }
  }
});
