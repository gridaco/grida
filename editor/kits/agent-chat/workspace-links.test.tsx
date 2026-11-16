import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Streamdown } from "streamdown";
import { workspace_links } from "./workspace-links";

function render(markdown: string, open: ((path: string) => void) | null) {
  return renderToStaticMarkup(
    <workspace_links.Opener.Provider value={open}>
      <Streamdown
        mode="static"
        rehypePlugins={workspace_links.rehypePlugins}
        components={workspace_links.components}
      >
        {markdown}
      </Streamdown>
    </workspace_links.Opener.Provider>
  );
}

describe("workspace_links", () => {
  it("recognizes workspace paths and leaves web links alone", () => {
    expect(workspace_links.path("make-space-for-wonder.svg")).toBe(
      "make-space-for-wonder.svg"
    );
    expect(workspace_links.path("kit/site/index.html")).toBe(
      "kit/site/index.html"
    );
    expect(workspace_links.path("./poster.svg")).toBe("./poster.svg");
    expect(workspace_links.path("file:///Users/me/My%20Kit/a.svg")).toBe(
      "/Users/me/My Kit/a.svg"
    );
    for (const href of [
      "https://grida.co",
      "mailto:hi@example.com",
      "#section",
      "//cdn.example.com/a.js",
      "javascript:alert(1)",
      "",
    ])
      expect(workspace_links.path(href)).toBeNull();
  });

  it("names files in the workspace's root-relative form", () => {
    expect(workspace_links.workspacePath("make-space-for-wonder.svg")).toBe(
      "/make-space-for-wonder.svg"
    );
    expect(workspace_links.workspacePath("./kit/./index.html")).toBe(
      "/kit/index.html"
    );
    expect(workspace_links.workspacePath("/kit/index.html")).toBe(
      "/kit/index.html"
    );
    expect(workspace_links.workspacePath("../secret.txt")).toBeNull();
    expect(workspace_links.workspacePath("kit/../../x")).toBeNull();
  });

  it("renders a relative file link as an openable link instead of blocking it", () => {
    const html = render(
      "Created [Make Space for Wonder](make-space-for-wonder.svg).",
      () => {}
    );
    expect(html).not.toContain("[blocked]");
    expect(html).toContain('title="make-space-for-wonder.svg"');
    expect(html).toContain("Make Space for Wonder</a>");
  });

  it("shows a file link as text where there is no workspace", () => {
    const html = render("See [the kit](kit/index.html).", null);
    expect(html).not.toContain("[blocked]");
    expect(html).not.toContain("<a");
    expect(html).toContain("the kit");
  });

  it("keeps web links and still refuses unsafe ones", () => {
    const html = render(
      "[Grida](https://grida.co) and [bad](javascript:alert(1))",
      () => {}
    );
    expect(html).toContain('href="https://grida.co/"');
    expect(html).not.toContain("javascript:");
  });
});
