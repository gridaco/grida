import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { TooltipProvider } from "@app/ui/components/tooltip";
import { ComposerContent, ComposerProvider } from "@/kits/composer";
import { WorkspaceWorkbench } from "./workspace-workbench";
import "@/app/ui.css";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({}),
}));
vi.mock("@/app/(library)/library/attachment", () => ({
  readLibraryAttachment: async () => null,
}));
vi.mock("../shared/agent-library-attachment-picker", () => ({
  AgentLibraryAttachmentPicker: () => null,
}));

// Keep the document viewers out of this keyboard interaction fixture.
vi.mock("./editor-pane", () => ({
  EditorPane: () => <div>Workspace document</div>,
  WorkspaceExplorerToggleButton: () => <div>File tree controls</div>,
}));

vi.mock("./agent-pane", () => ({
  AgentPane: () => (
    <ComposerProvider catalog={{ commands: [], mentions: [] }}>
      <ComposerContent />
    </ComposerProvider>
  ),
}));

it("lets the composer claim Bold before the workspace toggles the file tree", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <WorkspaceWorkbench
            workspace={{
              id: "workspace-shortcuts",
              root: "/fixture/workspace",
              name: "Workspace shortcuts",
              opened_at: 0,
              pinned: false,
            }}
          />
        </TooltipProvider>
      );
    });
    const composer = container.querySelector<HTMLElement>(
      "[data-composer-editor]"
    )!;
    const bold = /Mac/.test(navigator.platform) ? "Meta" : "Control";
    const tree = page.getByText("File tree controls", { exact: true });
    await expect.element(tree).not.toBeInTheDocument();

    await act(async () => {
      composer.focus();
      await userEvent.keyboard(`{${bold}>}b{/${bold}}Bold`);
    });
    expect(composer.querySelector("strong")?.textContent).toBe("Bold");
    await expect.element(tree).not.toBeInTheDocument();

    await act(async () => {
      composer.blur();
      await userEvent.keyboard(`{${bold}>}b{/${bold}}`);
    });
    await expect.element(tree).toBeVisible();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
