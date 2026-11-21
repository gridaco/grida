import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ComposerContent,
  ComposerProvider,
  useComposerInternals,
} from "./composer-react";
import {
  ComposerActionMenu,
  ComposerMenuAnchor,
  ComposerTriggerMenu,
} from "./composer-menu";
import { ComposerTiptap } from "./composer-tiptap";

describe("composer menus in a browser", () => {
  const roots: Root[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.replaceChildren();
  });

  async function setup() {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let internals: ReturnType<typeof useComposerInternals> | null = null;
    const action = vi.fn<() => void>();
    function Access() {
      internals = useComposerInternals();
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(
        <ComposerProvider
          catalog={{
            commands: [{ id: "review", title: "Review" }],
            mentions: [
              {
                id: "readme",
                label: "README.md",
                kind: "file",
                path: "README.md",
              },
            ],
          }}
        >
          <Access />
          <ComposerMenuAnchor>
            <ComposerTriggerMenu />
            <ComposerContent />
            <div data-toolbar style={{ overflow: "hidden" }}>
              <ComposerActionMenu
                items={[{ id: "files", title: "Files", onSelect: action }]}
              />
            </div>
          </ComposerMenuAnchor>
        </ComposerProvider>
      );
    });
    await vi.waitFor(() => expect(internals?.editor).toBeTruthy());
    return { container, action, current: () => internals! };
  }

  function typeTrigger(
    fixture: Awaited<ReturnType<typeof setup>>,
    text = "/re"
  ) {
    act(() => {
      const { editor, core } = fixture.current();
      editor!.commands.setContent(`<p>${text}</p>`);
      editor!.commands.setTextSelection(text.length + 1);
      ComposerTiptap.syncCore(core, editor!);
    });
  }

  it("fills an empty draft and appends later text as a new paragraph", async () => {
    const fixture = await setup();
    const editor = fixture.current().editor!;
    const paragraphs = () =>
      Array.from(editor.view.dom.querySelectorAll("p"), (p) => p.textContent);
    await act(async () => {
      expect(ComposerTiptap.appendText(editor, "First", 5)).toBe(true);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    });
    expect(paragraphs()).toEqual(["First"]);

    await act(async () => {
      expect(ComposerTiptap.appendText(editor, "Second", 12)).toBe(true);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    });
    expect(paragraphs()).toEqual(["First", "Second"]);
  });

  it("dismisses outside clicks without losing the typed completion and stays dismissed on unchanged inspection", async () => {
    const fixture = await setup();
    typeTrigger(fixture);
    expect(
      fixture.container.querySelector("[data-composer-trigger-menu]")
    ).not.toBeNull();
    const { editor, core } = fixture.current();
    const before = editor!.getJSON();
    act(() =>
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true })
      )
    );
    expect(
      fixture.container.querySelector("[data-composer-trigger-menu]")
    ).toBeNull();
    expect(editor!.getJSON()).toEqual(before);
    act(() => ComposerTiptap.syncCore(core, editor!));
    expect(
      fixture.container.querySelector("[data-composer-trigger-menu]")
    ).toBeNull();
    typeTrigger(fixture, "/rev");
    expect(
      fixture.container.querySelector("[data-composer-trigger-menu]")
    ).not.toBeNull();
  });

  it("opens and dismisses a mention without remounting the editor", async () => {
    const fixture = await setup();
    const { editor } = fixture.current();
    typeTrigger(fixture, "@");
    expect(
      fixture.container.querySelector("[data-composer-trigger-menu]")
        ?.textContent
    ).toContain("README.md");
    typeTrigger(fixture, "Draft");
    expect(
      fixture.container.querySelector("[data-composer-trigger-menu]")
    ).toBeNull();
    expect(fixture.current().editor).toBe(editor);
  });

  it.each(["mouse", "keyboard"] as const)(
    "places + actions at the completion anchor outside the clipped toolbar and supports %s selection",
    async (input) => {
      const fixture = await setup();
      typeTrigger(fixture);
      const completion = fixture.container.querySelector<HTMLElement>(
        "[data-composer-trigger-menu]"
      )!;
      const classes = completion.className;
      const anchor = completion.parentElement;
      const button = fixture.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Add to message"]'
      )!;
      act(() => {
        button.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true })
        );
        button.click();
      });
      const panel = fixture.container.querySelector<HTMLElement>(
        "[data-composer-action-menu]"
      )!;
      expect(panel).not.toBeNull();
      expect(panel.parentElement).toBe(anchor);
      expect(panel.className).toBe(classes);
      expect(panel.closest("[data-toolbar]")).toBeNull();
      expect(
        fixture.container.querySelector("[data-composer-trigger-menu]")
      ).toBeNull();
      const item = Array.from(
        panel.querySelectorAll<HTMLElement>('[role="option"]')
      ).find((element) => element.textContent?.includes("Files"))!;
      act(() => {
        if (input === "mouse") item.click();
        else
          panel
            .querySelector<HTMLElement>("[cmdk-root]")!
            .dispatchEvent(
              new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
            );
      });
      expect(fixture.action).toHaveBeenCalledOnce();
      expect(
        fixture.container.querySelector("[data-composer-action-menu]")
      ).toBeNull();
      expect(fixture.current().editor!.getText()).toBe("/re");
    }
  );

  it("dismisses + actions with Escape and outside clicks", async () => {
    const fixture = await setup();
    const button = fixture.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Add to message"]'
    )!;
    act(() => button.click());
    let panel = fixture.container.querySelector<HTMLElement>(
      "[data-composer-action-menu]"
    )!;
    act(() =>
      panel
        .querySelector<HTMLElement>("[cmdk-root]")!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        )
    );
    expect(
      fixture.container.querySelector("[data-composer-action-menu]")
    ).toBeNull();
    expect(document.activeElement).toBe(button);
    act(() => button.click());
    panel = fixture.container.querySelector<HTMLElement>(
      "[data-composer-action-menu]"
    )!;
    expect(panel).not.toBeNull();
    act(() =>
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true })
      )
    );
    expect(
      fixture.container.querySelector("[data-composer-action-menu]")
    ).toBeNull();
  });
});
