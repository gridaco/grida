import { act, useState, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { DesktopConversationFixtures } from "./desktop-conversation-fixtures";
import ComposerPage from "./page";
import { DesktopComposerDemo } from "./desktop-demo";
import { LinkDemo } from "./link-demo";
import { MarkdownComparison } from "./markdown-comparison";
import { PreviewRefreshDemo } from "./preview-refresh-demo";
import { DesktopComposerFixtures as fixtures } from "./desktop-fixtures";
import { AgentComposerInput } from "@/scaffolds/desktop/shared/agent-composer-input";
import { NativeModelPicker } from "@/scaffolds/desktop/workbench/native-chat-controls";
import { BrowserSettings } from "@/app/desktop/settings/_components/browser-settings";
import { ChatResponseCards, workspace_links } from "@/kits/agent-chat";
import { ResponseCards } from "@/lib/agent-chat/response-cards";
import { Browser } from "@/lib/desktop/browser";
import { BrowserLinkPreferences } from "@/lib/desktop/browser-link-preferences";
import {
  BrowserOpen,
  BrowserPreview,
} from "@/lib/desktop/browser-open-context";
import { PagePreviews } from "@/lib/desktop/page-previews";
import {
  DESKTOP_BRIDGE_PROTOCOL,
  type NativeChatProfileSelection,
} from "@grida/desktop-bridge";

// These examples exercise Desktop layout and chat IPC with local fixtures.
vi.mock("@/app/(library)/library/attachment", () => ({
  readLibraryAttachment: async () => null,
}));
vi.mock("@/scaffolds/desktop/shared/design-search", () => ({
  DESIGN_SEARCH_PAGE: 30,
  resolveDesignBrowsePage: async () => {
    throw new Error("Unexpected live Library browse");
  },
  resolveLibraryExplorerPage: async () => {
    throw new Error("Unexpected live Library search");
  },
}));

const roots: Root[] = [];
async function mountDemo(example: ReactNode): Promise<HTMLDivElement> {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(example));
  return container;
}

async function mountConversationDemo(
  props: ComponentProps<typeof DesktopComposerDemo> = { queued: true }
) {
  const container = await mountDemo(<DesktopComposerDemo {...props} />);
  await expect.poll(() => container.textContent).toContain("Example model A");
  await expect
    .poll(() => queuedPreviews(container).length)
    .toBe(props.queued ? 3 : 0);
  return container;
}

function conversation(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('[role="log"]')!;
}

it("previews public transcript links with optional images and a fallback", async () => {
  const openLink = vi.fn<Browser.OpenHandler>(() => true);
  await mountDemo(
    <BrowserOpen value={openLink}>
      <LinkDemo />
    </BrowserOpen>
  );
  const card = page.getByRole("dialog", { name: "Link preview", exact: true });
  const images = () => Array.from(card.query()?.querySelectorAll("img") ?? []);
  const guide = page
    .getByRole("link", { name: "CSS Grid guide", exact: true })
    .first();
  const grida = page
    .getByRole("link", { name: "Grida docs", exact: true })
    .first();
  const linear = page
    .getByRole("link", { name: "Linear", exact: true })
    .first();
  await expect.element(card).not.toBeInTheDocument();
  await act(async () => guide.hover());
  await expect.element(card).toBeVisible();
  await expect.element(card).toHaveAttribute("aria-busy", "true");
  await expect.element(card.getByText("CSS Grid layout")).toBeVisible();
  await expect.element(card.getByRole("link", { name: /open/i })).toBeVisible();
  expect(images()).toHaveLength(0);

  await act(async () => grida.hover());
  await expect.element(card.getByText("Grida documentation")).toBeVisible();
  await expect
    .poll(() => images().map((image) => image.naturalWidth))
    .toEqual([64, 1280]);

  await act(async () => page.getByRole("button", { name: "Reset" }).hover());
  await expect.element(card).not.toBeInTheDocument();
  await act(async () => linear.hover());
  await expect
    .element(card.getByText("linear.app", { exact: true }))
    .toBeVisible();
  await expect.element(card).not.toHaveAttribute("aria-busy", "true");
  await expect
    .element(card.getByText("Grida documentation"))
    .not.toBeInTheDocument();
  expect(images()).toHaveLength(0);
  await act(async () => {
    (linear.element() as HTMLAnchorElement).focus();
    await userEvent.keyboard("{ArrowDown}");
  });
  await expect
    .element(card.getByRole("link", { name: "Open linear.app" }))
    .toHaveFocus();
  await act(async () => userEvent.keyboard("{Escape}"));
  await expect.element(card).not.toBeInTheDocument();
  await expect.element(linear).toHaveFocus();
  expect(openLink).not.toHaveBeenCalled();

  await act(async () => userEvent.keyboard("{ArrowDown}"));
  await expect
    .element(card.getByRole("link", { name: "Open linear.app" }))
    .toHaveFocus();
  await act(async () => userEvent.keyboard("{Enter}"));
  expect(openLink).toHaveBeenCalledExactlyOnceWith(
    "https://linear.app/docs/editor"
  );
  await expect.element(card).not.toBeInTheDocument();
});

it("uses the independent Browser settings for composer and workspace link opens", async () => {
  const openSystem = vi
    .fn<(url: string) => Promise<void>>()
    .mockResolvedValue();
  const openInWorkbench = vi
    .fn<(url: string) => boolean>()
    .mockReturnValue(true);
  vi.stubGlobal("grida", {
    protocol: DESKTOP_BRIDGE_PROTOCOL,
    caps: { native: { browser: false } },
    shell: { open_external: openSystem },
  });
  const previous = BrowserLinkPreferences.read();
  const localUrl = "http://localhost:4173/sample#section";
  const webUrl = "https://grida.co/docs";
  try {
    BrowserLinkPreferences.set("web", "grida");
    BrowserLinkPreferences.set("local", "grida");
    const container = await mountDemo(
      <>
        <BrowserSettings />
        <BrowserOpen value={Browser.opener(openInWorkbench)}>
          <workspace_links.Link href={localUrl}>
            Local preview
          </workspace_links.Link>
          <LinkDemo />
        </BrowserOpen>
      </>
    );
    const web = page.getByRole("combobox", { name: "Open web links in" });
    const local = page.getByRole("combobox", { name: "Open local links in" });
    const defaultBrowser = page.getByRole("option", {
      name: "Default browser",
    });
    await expect.element(web).toHaveTextContent("Grida");
    await expect.element(local).toHaveTextContent("Grida");
    await act(async () => web.click());
    await act(async () => defaultBrowser.click());
    await expect.element(web).toHaveTextContent("Default browser");
    await expect.element(local).toHaveTextContent("Grida");

    const draftLink = container.querySelector<HTMLAnchorElement>(
      `[data-composer-editor] a[href="${webUrl}"]`
    )!;
    await act(async () => userEvent.click(draftLink));
    const actions = page.getByRole("group", { name: "Link actions" });
    await act(async () =>
      actions.getByRole("link", { name: "Open link" }).click()
    );
    expect(openSystem).toHaveBeenCalledExactlyOnceWith(webUrl);
    expect(openInWorkbench).not.toHaveBeenCalled();

    const localLink = page.getByRole("link", { name: "Local preview" });
    await act(async () => localLink.click());
    expect(openInWorkbench).toHaveBeenCalledExactlyOnceWith(localUrl);
    await act(async () => local.click());
    await act(async () => defaultBrowser.click());
    await expect.element(local).toHaveTextContent("Default browser");
    await act(async () => localLink.click());
    expect(openInWorkbench).toHaveBeenCalledTimes(1);
    expect(openSystem.mock.calls).toEqual([[webUrl], [localUrl]]);
  } finally {
    act(() => {
      BrowserLinkPreferences.set("web", previous.web);
      BrowserLinkPreferences.set("local", previous.local);
    });
    vi.unstubAllGlobals();
  }
});

it("offers dictation across the composer playground", async () => {
  await mountDemo(<ComposerPage />);
  for (const name of [
    "Chat composer",
    "Links",
    "Long pasted text",
    "Kit and files",
  ]) {
    const example = page.getByRole("region", { name, exact: true });
    await expect
      .element(example.getByRole("button", { name: "Dictate", exact: true }))
      .toBeEnabled();
  }
});

it("shows both compaction states when the playground opens", async () => {
  await mountDemo(<ComposerPage />);
  const example = page.getByRole("region", { name: "Compaction", exact: true });
  const saved = example.getByText("Context compacted", {
    exact: true,
  });
  const progress = example.getByRole("status").getByText("Compacting context");
  await expect.element(saved).toBeVisible();
  await expect.element(progress).toBeVisible();
  expect(saved.element().compareDocumentPosition(progress.element())).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING
  );
  await saved.click();
  await expect
    .element(
      example.getByText("The gallery handout is for a self-guided tour.")
    )
    .toBeVisible();
});

it("runs the optional compaction walkthrough through the Desktop composer", async () => {
  const container = await mountConversationDemo({ scenario: "compaction" });
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  await act(async () => userEvent.fill(editor, "/compact"));
  await expect
    .element(page.getByRole("option", { name: /compact/i }))
    .toBeVisible();
  await act(async () => page.getByRole("option", { name: /compact/i }).click());
  await act(async () => userEvent.keyboard("{Enter}"));

  const log = page.getByRole("log");
  const progress = log.getByText("Compacting context", { exact: true });
  await expect.element(progress).toBeVisible();
  await clickButton("Finish compaction");
  await expect
    .element(log.getByText("Context compacted", { exact: true }))
    .toBeVisible();
  await expect.element(progress).not.toBeInTheDocument();
});

it("shares the Desktop opener between finished previews and Markdown links", async () => {
  await mountConversationDemo({ scenario: "web-preview" });
  const log = page.getByRole("log");
  const previews = log.getByRole("group", { name: "Web preview" });
  const openButton = (index: number, host: string) =>
    previews.nth(index).getByRole("button", {
      name: `Open web preview at ${host}`,
      exact: true,
    });
  const gallery = openButton(2, "localhost:4173");
  const request = page.getByText(
    "Workbench browser requested for http://localhost:4173/gallery",
    { exact: true }
  );

  await expect
    .element(log.getByText("Can I see the print layout, too?"))
    .toBeVisible();
  await expect.element(gallery).toBeVisible();
  await expect.element(previews).toHaveLength(3);
  const galleryCard = previews.nth(2);
  expect(galleryCard.element().tagName).toBe("DIV");
  expect(galleryCard.element().querySelector("button button")).toBeNull();
  await act(async () => gallery.element().scrollIntoView({ block: "center" }));
  await expect.element(galleryCard.getByText("Gallery tour")).toBeVisible();
  await expect
    .element(galleryCard.getByText("An exhibition guide with three stops."))
    .toBeVisible();
  expect(galleryCard.element().textContent).not.toContain("localhost:4173");
  expect(galleryCard.element().querySelector("img")?.src).toMatch(
    /^data:image\/png/
  );
  expect(request.query()).toBeNull();

  await act(async () => gallery.click());
  await expect.element(request).toBeVisible();

  const options = galleryCard.getByRole("button", {
    name: "Web preview open options",
  });
  await act(async () => options.click());
  await act(async () =>
    page.getByRole("menuitem", { name: "Open in default browser" }).click()
  );
  const externalRequest = page.getByText(
    "System browser requested for http://localhost:4173/gallery",
    { exact: true }
  );
  await expect.element(externalRequest).toBeVisible();

  const clipboard = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue();
  try {
    await act(async () => options.click());
    await act(async () =>
      page.getByRole("menuitem", { name: "Copy link" }).click()
    );
    expect(clipboard).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:4173/gallery"
    );
    await expect.element(externalRequest).toBeVisible();
  } finally {
    clipboard.mockRestore();
  }

  const inline = log.getByRole("link", {
    name: "Light gallery",
    exact: true,
  });
  await expect
    .element(inline)
    .toHaveAttribute("href", "http://localhost:4173/light");
  await act(async () => inline.click());
  const inlineRequest = page.getByText(
    "Workbench browser requested for http://localhost:4173/light",
    { exact: true }
  );
  await expect.element(inlineRequest).toBeVisible();

  const fx = openButton(1, "127.0.0.1:4174");
  await act(async () => fx.element().scrollIntoView({ block: "center" }));
  const fxCard = previews.nth(1);
  await expect.element(fxCard.getByText("FX Viewer")).toBeVisible();
  await expect
    .element(fxCard.getByText("Browse workflow plans and runs."))
    .toBeVisible();
  expect(fxCard.element().textContent).not.toContain("127.0.0.1:4174");
  const fxLink = log.getByRole("link", { name: "workflow viewer" });
  expect(
    fxLink.element().querySelector("svg[data-chat-web-link-favicon]")
  ).toBeVisible();
  const hover = page.getByRole("dialog", { name: "Link preview" });
  await act(async () => fxLink.hover());
  await expect
    .element(hover.getByText("FX Viewer", { exact: true }))
    .toBeVisible();
  await expect.element(hover.getByText("Gallery cover workflow")).toBeVisible();
  await act(async () => userEvent.keyboard("{Escape}"));
  await expect.element(hover).not.toBeInTheDocument();

  const archive = openButton(0, "localhost:4173");
  await act(async () => archive.element().scrollIntoView({ block: "center" }));
  const archiveCard = previews.nth(0);
  await expect
    .element(archiveCard.getByText("Web preview", { exact: true }))
    .toBeVisible();
  await expect
    .element(archiveCard.getByText("localhost:4173", { exact: true }))
    .toBeVisible();

  await act(async () =>
    page.getByRole("button", { name: "Finish reply" }).click()
  );
  await expect.element(previews).toHaveLength(4);
  const print = openButton(3, "localhost:4173");
  await act(async () => print.element().scrollIntoView({ block: "center" }));
  await expect.element(print).toBeEnabled();
  await expect
    .element(previews.nth(3).getByText("Print layout"), {
      timeout: 4000,
    })
    .toBeVisible();
  await expect.element(inlineRequest).toBeVisible();
});

it("starts a preview on intersection and releases pending work offscreen", async () => {
  const load = vi.fn<PagePreviews.Lookup>(
    (_, signal) =>
      new Promise<null>((resolve) =>
        signal.addEventListener("abort", () => resolve(null), { once: true })
      )
  );
  const url = "http://127.0.0.1:4174/plan";
  const previews = new PagePreviews.Controller(load);
  const container = await mountDemo(
    <div style={{ height: 100, overflow: "auto" }}>
      <div style={{ height: 300 }} />
      <BrowserPreview value={previews}>
        <ChatResponseCards
          cards={ResponseCards.forReply({ text: url })}
          open={() => true}
        />
      </BrowserPreview>
      <div style={{ height: 300 }} />
    </div>
  );
  const scroller = container.firstElementChild as HTMLDivElement;
  const card = scroller.querySelector('[aria-label="Web preview"]')!;
  await new Promise(requestAnimationFrame);
  expect(load).not.toHaveBeenCalled();
  card.scrollIntoView({ block: "center" });
  await expect.poll(() => load.mock.calls.length).toBe(1);
  const [[requested, signal]] = load.mock.calls;
  expect(requested).toBe(url);
  expect(signal.aborted).toBe(false);
  scroller.scrollTop = 0;
  await expect.poll(() => signal.aborted).toBe(true);
});

it("shares a local preview refresh across existing cards and its inline icon", async () => {
  await mountDemo(<PreviewRefreshDemo />);
  const cards = page.getByRole("group", { name: "Web preview" });
  const link = page.getByRole("link", { name: "workflow viewer" });
  const card = page.getByRole("dialog", { name: "Link preview" });
  const checks = page.getByRole("status");
  await expect.element(cards.getByText("127.0.0.1:4174")).toHaveLength(2);
  await expect.element(checks).toHaveTextContent("Preview checks: 1");
  expect(link.element().querySelector("img")).toBeNull();

  await act(async () =>
    page.getByRole("button", { name: "Start sample server" }).click()
  );
  await expect.element(checks).toHaveTextContent("Preview checks: 1");
  await act(async () => link.hover());
  await expect.element(card.getByText("FX Viewer")).toBeVisible();
  await expect.element(cards.getByText("FX Viewer")).toHaveLength(2);
  await expect
    .poll(() => link.element().querySelector("img")?.naturalWidth)
    .toBe(64);
  await expect.element(checks).toHaveTextContent("Preview checks: 2");

  await act(async () =>
    page.getByRole("button", { name: "Stop sample server" }).click()
  );
  await expect.element(card).not.toBeInTheDocument();
  await act(async () => link.hover());
  await expect.element(checks).toHaveTextContent("Preview checks: 3");
  await expect.element(cards.getByText("127.0.0.1:4174")).toHaveLength(2);
  expect(link.element().querySelector("img")).toBeNull();
});

it("keeps the inline favicon visible when a transcript link wraps", async () => {
  const previews = new PagePreviews.Controller(async () => ({
    metadata: { favicon: { dataUrl: "/logos/grida-favicon.png" } },
  }));
  await mountDemo(
    <BrowserPreview value={previews}>
      <div
        className="wrapping-preview"
        style={{ width: 200, font: "16px monospace" }}
      >
        <style>{".wrapping-preview img { max-width: 100%; }"}</style>
        <span style={{ display: "inline-block", width: 150 }} />
        <workspace_links.Link href="http://localhost:4173/plan">
          Go to viewer
        </workspace_links.Link>
      </div>
    </BrowserPreview>
  );
  const link = page.getByRole("link", { name: "Go to viewer" });
  expect(link.element().getClientRects().length).toBeGreaterThan(1);
  await act(async () => link.hover());
  await expect
    .poll(() => link.element().querySelector("img")?.naturalWidth)
    .toBe(64);
  await expect
    .poll(() => {
      const icon = link.element().querySelector("img");
      return icon?.complete ? icon.getBoundingClientRect().width : 0;
    })
    .toBeGreaterThan(10);
});

function menuItem(panel: HTMLElement, title: string): HTMLElement {
  return Array.from(
    panel.querySelectorAll<HTMLElement>('[role="option"]')
  ).find((option) =>
    Array.from(option.querySelectorAll("span")).some(
      (label) => label.textContent === title
    )
  )!;
}

async function openAddMenu(container: HTMLElement): Promise<HTMLElement> {
  await act(async () =>
    userEvent.click(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Add to message"]'
      )!
    )
  );
  await expect
    .poll(() => container.querySelector("[data-composer-action-menu]"))
    .not.toBeNull();
  return container.querySelector<HTMLElement>("[data-composer-action-menu]")!;
}

async function selectAddMenuAction(container: HTMLElement, title: string) {
  const item = menuItem(await openAddMenu(container), title);
  await act(async () => userEvent.click(item));
}

async function stageAttachment(container: HTMLElement, kind: "image" | "file") {
  const file =
    kind === "image"
      ? new File(
          [await fixtures.readImage(fixtures.image.previewId!)],
          "reference.jpg",
          { type: "image/jpeg" }
        )
      : new File(["# Composer notes"], "README.md", { type: "text/markdown" });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  await act(async () => {
    conversation(container).dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      })
    );
  });
  await expect
    .poll(() =>
      container.querySelector(`button[aria-label="Remove ${file.name}"]`)
    )
    .not.toBeNull();
}

function runningTurn(container: HTMLElement): HTMLInputElement {
  return Array.from(container.querySelectorAll("label"))
    .find((label) => label.textContent?.includes("Running turn"))!
    .querySelector<HTMLInputElement>('input[type="checkbox"]')!;
}

function queuedPreviews(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="native-composer-queue"] button[aria-label="Preview queued message"]'
    )
  );
}

function textButton(container: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => button.textContent?.trim() === label)!;
}

function queuedSteer(preview: HTMLButtonElement) {
  return Array.from(
    preview.parentElement!.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => button.textContent?.trim() === "Steer");
}

function sendButton(container: HTMLElement): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Send"]'
  )!;
}

async function openQueueActions(
  container: HTMLElement,
  index = 0
): Promise<HTMLElement> {
  const row = queuedPreviews(container)[index].parentElement!;
  const trigger = row.querySelector<HTMLButtonElement>(
    'button[aria-label="More queue actions"]'
  )!;
  await act(async () => {
    trigger.focus();
    await userEvent.keyboard("{Enter}");
  });
  await expect
    .poll(() => document.querySelector('[role="menu"]'))
    .not.toBeNull();
  return document.querySelector<HTMLElement>('[role="menu"]')!;
}

async function editQueuedMessage(container: HTMLElement, index = 0) {
  const queueSize = queuedPreviews(container).length;
  const menu = await openQueueActions(container, index);
  const edit = Array.from(
    menu.querySelectorAll<HTMLElement>('[role="menuitem"]')
  ).find((item) => item.textContent?.trim() === "Edit")!;
  expect(edit.getAttribute("aria-disabled")).not.toBe("true");
  await act(async () => {
    edit.focus();
    await userEvent.keyboard("{Enter}");
  });
  await expect.poll(() => queuedPreviews(container).length).toBe(queueSize - 1);
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it("preserves lists and code from the composer in the sent user bubble", async () => {
  const container = await mountConversationDemo({ scenario: "empty" });
  const editor = container.querySelector<HTMLElement>(
    "[data-composer-editor]"
  )!;
  const clipboard = new DataTransfer();
  clipboard.setData(
    "text/html",
    "<ul><li>First bullet</li><li>Second bullet</li></ul>" +
      '<ol start="3"><li>Review <code>status()</code></li><li>Run checks</li></ol>'
  );
  await act(async () => {
    editor.focus();
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      })
    );
  });
  expect(editor.querySelectorAll("ul > li")).toHaveLength(2);
  expect(editor.querySelector("ol")?.start).toBe(3);
  await clickButton("Send");

  const bubble = page.getByRole("group", { name: "Message text" });
  await expect.element(bubble).toHaveTextContent("First bullet");
  expect(bubble.element().querySelectorAll("ul > li")).toHaveLength(2);
  expect(bubble.element().querySelector("ol")?.start).toBe(3);
  expect(bubble.element().querySelector("ol code")?.textContent).toBe(
    "status()"
  );
});

it("turns explicit Markdown links into draft links and keeps them when sent", async () => {
  const container = await mountConversationDemo({ scenario: "empty" });
  const editor = container.querySelector<HTMLElement>(
    "[data-composer-editor]"
  )!;

  await act(async () => {
    editor.focus();
    await userEvent.keyboard("See [[this](https://example.com) and ");
  });
  expect(editor.querySelector("a")?.textContent).toBe("this");
  expect(editor.querySelector("a")?.getAttribute("href")).toBe(
    "https://example.com"
  );
  expect(editor.lastElementChild?.textContent).toBe("See this and ");

  const clipboard = new DataTransfer();
  clipboard.setData(
    "text/plain",
    "[the docs](https://example.com/Guide_(draft))"
  );
  await act(async () => {
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      })
    );
  });
  expect(
    Array.from(editor.querySelectorAll("a"), (link) => link.textContent)
  ).toEqual(["this", "the docs"]);

  await act(async () => userEvent.keyboard("{Enter}"));
  const bubble = page.getByRole("group", { name: "Message text" });
  await expect
    .element(bubble.getByRole("link", { name: "this" }))
    .toHaveAttribute("href", "https://example.com/");
  await expect
    .element(bubble.getByRole("link", { name: "the docs" }))
    .toHaveAttribute("href", "https://example.com/Guide_(draft)");
});

it("formats a draft selection and edits a link without sending the draft", async () => {
  const container = await mountConversationDemo({ scenario: "empty" });
  const editor = container.querySelector<HTMLElement>(
    "[data-composer-editor]"
  )!;
  await act(async () => {
    editor.focus();
    await userEvent.keyboard("Guide{Shift>}{ArrowLeft>5/}{/Shift}");
  });
  const formatting = page.getByRole("group", { name: "Text formatting" });
  const bold = formatting.getByRole("button", { name: "Bold" });
  await act(async () => bold.hover());
  await expect
    .element(page.getByRole("tooltip", { name: "Bold" }))
    .toBeInTheDocument();
  expect(formatting.element().querySelectorAll("button")).toHaveLength(3);
  await act(async () => {
    await bold.click();
    await formatting.getByRole("button", { name: "Italic" }).click();
  });
  await act(async () =>
    formatting.getByRole("button", { name: "Add link" }).click()
  );
  const url = page.getByRole("textbox", { name: "Link URL" });
  await expect.element(url).toHaveFocus();
  await act(async () => {
    await url.fill("https://example.com/first");
    await userEvent.keyboard("{Enter}");
  });
  expect(editor.querySelector("a strong em")?.textContent).toBe("Guide");
  await act(async () => userEvent.click(editor.querySelector("a")!));
  const actions = page.getByRole("group", { name: "Link actions" });
  await expect
    .element(actions.getByRole("link", { name: "Open link" }))
    .toHaveAttribute("href", "https://example.com/first");
  await act(async () =>
    actions.getByRole("button", { name: "Edit text" }).click()
  );
  const label = page.getByRole("textbox", { name: "Link text" });
  await expect.element(label).toHaveValue("Guide");
  await act(async () => {
    await label.fill("Guide notes");
    await userEvent.keyboard("{Enter}");
  });
  expect(editor.querySelector("a strong em")?.textContent).toBe("Guide notes");
  await act(async () => userEvent.click(editor.querySelector("a")!));
  await act(async () =>
    actions.getByRole("button", { name: "Edit link" }).click()
  );
  await expect.element(url).toHaveValue("https://example.com/first");
  await act(async () => {
    await url.fill("https://example.com/guide");
    await userEvent.keyboard("{Enter}");
  });
  const bubble = page.getByRole("group", { name: "Message text" });
  await expect.element(bubble).not.toBeInTheDocument();
  await act(async () => userEvent.keyboard("{Enter}"));
  const link = bubble.getByRole("link", { name: "Guide notes" });
  await expect
    .element(link)
    .toHaveAttribute("href", "https://example.com/guide");
  expect(
    link.element().querySelector('em [data-streamdown="strong"]')
  ).not.toBeNull();
});

it("renders composer formatting in the user bubble and extended Markdown in agent replies", async () => {
  const container = await mountDemo(<MarkdownComparison />);
  const user = page.getByRole("group", { name: "Message text" }).nth(1);

  await expect.element(user).toHaveTextContent("# Gallery handout");
  expect(user.element().textContent).toContain(
    "| Stop | Location | Minutes |\n| :--- | :------: | ------: |"
  );
  expect(
    user.element().querySelector('[data-streamdown="strong"]')?.textContent
  ).toBe("10:00");
  expect(
    user.element().querySelector("h1, table, del, img, input, .katex")
  ).toBeNull();
  await expect
    .element(page.getByRole("heading", { name: "Gallery handout", level: 1 }))
    .toBeVisible();
  await expect
    .element(
      page.getByRole("table").getByRole("cell", { name: "Print gallery" })
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("img", { name: "Wind Garden artwork" }))
    .toBeVisible();
  expect(
    container.querySelector("[data-composer-editor] pre")?.textContent
  ).toContain('const label = "Gallery";');
});

it("continues composer lists on Shift+Enter and hides the empty-list placeholder", async () => {
  const container = await mountConversationDemo({ scenario: "empty" });
  const editor = container.querySelector<HTMLElement>(
    "[data-composer-editor]"
  )!;
  expect(getComputedStyle(editor.firstElementChild!, "::before").content).toBe(
    '"Ask anything…"'
  );

  await act(async () => {
    editor.focus();
    await userEvent.keyboard("- ");
  });
  const list = editor.querySelector("ul");
  expect(list).not.toBeNull();
  expect(getComputedStyle(list!, "::before").content).toBe("none");

  await act(async () =>
    userEvent.keyboard("First{Shift>}{Enter}{/Shift}Second")
  );
  expect(
    Array.from(editor.querySelectorAll("ul > li"), (item) => item.textContent)
  ).toEqual(["First", "Second"]);

  await act(async () =>
    userEvent.keyboard(
      "{Shift>}{Enter}{Enter}{/Shift}Steps{Shift>}{Enter}{/Shift}1. Review{Shift>}{Enter}{/Shift}Send"
    )
  );
  expect(
    Array.from(editor.querySelectorAll(":scope > p"), (p) => p.textContent)
  ).toEqual(["Steps"]);
  expect(
    Array.from(editor.querySelectorAll("ol > li"), (item) => item.textContent)
  ).toEqual(["Review", "Send"]);

  await act(async () => userEvent.keyboard("{Enter}"));
  const bubble = page.getByRole("group", { name: "Message text" });
  await expect.element(bubble).toHaveTextContent("Steps");
  expect(bubble.element().querySelectorAll("ul > li, ol > li")).toHaveLength(4);
});

it("keeps a question write-in focused during streaming and shows the accepted answer in chat", async () => {
  const playground = await mountDemo(<ComposerPage />);
  const container = playground.querySelector<HTMLElement>(
    'section[aria-labelledby="question"]'
  )!;
  const example = page.getByRole("region", { name: "Question", exact: true });
  const { question } = DesktopConversationFixtures.question;
  await act(async () => {
    await example.getByRole("radio", { name: "Large print" }).click();
    await userEvent.keyboard("{Enter}");
  });
  expect(conversation(container).textContent).toContain("Large print");
  await act(async () => example.getByRole("button", { name: "Reset" }).click());

  const input = example.getByRole("textbox", { name: question });
  await act(async () => {
    await example.getByRole("checkbox", { name: "Streaming" }).click();
    await input.fill("Use a folded sheet");
    await userEvent.keyboard(
      "{End}{Shift>}{Enter}{/Shift}with 2 large-print pages"
    );
  });
  await expect
    .poll(() => conversation(container).textContent)
    .toContain("organizing the handout");
  await expect.element(input).toHaveFocus();
  await expect
    .element(input)
    .toHaveValue("Use a folded sheet\nwith 2 large-print pages");
  await act(async () => userEvent.keyboard("{Enter}"));
  await expect.element(input).not.toBeInTheDocument();
  expect(conversation(container).querySelector("blockquote")?.textContent).toBe(
    question
  );
  expect(conversation(container).textContent).toContain("Use a folded sheet");
});

it("navigates question pages, choices, and the write-in with arrow keys", async () => {
  await mountConversationDemo({ scenario: "question-batch" });
  const first = page.getByRole("button", { name: /Compact/ });
  const last = page.getByRole("button", { name: /Large print/ });
  const writeIn = page.getByRole("textbox", {
    name: DesktopConversationFixtures.question.question,
  });
  const next = page.getByRole("button", { name: "Next question" });
  await act(async () => {
    (next.element() as HTMLButtonElement).focus();
    await userEvent.keyboard("{ArrowRight}");
  });
  await expect.element(page.getByText("2 of 3", { exact: true })).toBeVisible();
  await act(async () => userEvent.keyboard("{ArrowLeft}"));
  await act(async () => userEvent.keyboard("{ArrowDown}"));
  await expect.element(first).toHaveFocus();
  await expect.element(first).toHaveAttribute("aria-pressed", "true");
  await act(async () => userEvent.keyboard("{ArrowDown}"));
  await expect.element(last).toHaveFocus();
  await expect.element(last).toHaveAttribute("aria-pressed", "true");
  await act(async () => userEvent.keyboard("{ArrowDown}"));
  await expect.element(writeIn).toHaveFocus();
  await expect.element(last).toHaveAttribute("aria-pressed", "false");
  await act(async () => userEvent.keyboard("{Enter}"));
  await expect.element(page.getByText("1 of 3", { exact: true })).toBeVisible();

  await act(async () => {
    await writeIn.fill("Custom");
    await userEvent.keyboard("{End}{ArrowLeft}");
  });
  expect((writeIn.element() as HTMLTextAreaElement).selectionStart).toBe(5);
  await expect.element(page.getByText("1 of 3", { exact: true })).toBeVisible();
  await act(async () => userEvent.keyboard("{Home}{ArrowUp}"));
  await expect.element(last).toHaveFocus();
  await expect.element(last).toHaveAttribute("aria-pressed", "true");

  await act(async () => userEvent.keyboard("{Enter}"));
  await expect.element(page.getByText("2 of 3", { exact: true })).toBeVisible();
  await act(async () => userEvent.keyboard("{ArrowLeft}"));
  await expect.element(last).toHaveAttribute("aria-pressed", "true");
  await expect.element(writeIn).toHaveValue("");
  await act(async () => userEvent.keyboard("{ArrowUp}"));
  await expect.element(first).toHaveFocus();
  await expect.element(first).toHaveAttribute("aria-pressed", "true");
  await act(async () => userEvent.keyboard("{ArrowDown}{ArrowDown}"));
  await expect.element(writeIn).toHaveFocus();
  await expect.element(writeIn).toHaveValue("Custom");
  await expect.element(last).toHaveAttribute("aria-pressed", "false");
  await act(async () => userEvent.keyboard("{Enter}"));
  await expect.element(page.getByText("2 of 3", { exact: true })).toBeVisible();
  await act(async () => userEvent.keyboard("{ArrowLeft}"));
  await act(async () => userEvent.keyboard("{ArrowDown}"));
  await expect.element(writeIn).toHaveFocus();
  await expect.element(writeIn).toHaveValue("Custom");
  await act(async () => userEvent.keyboard("{Enter}"));
  await expect.element(page.getByText("2 of 3", { exact: true })).toBeVisible();
  await act(async () => userEvent.keyboard("{ArrowDown}"));
  await act(async () => userEvent.keyboard("{Enter}"));
  await expect.element(page.getByText("3 of 3", { exact: true })).toBeVisible();
  await act(async () => userEvent.keyboard("{ArrowDown}"));
  await expect
    .element(page.getByRole("radio", { name: "50 copies" }))
    .toHaveAttribute("aria-checked", "true");
  await act(async () => userEvent.keyboard("{Enter}"));
  await expect
    .element(page.getByText("I’ll use your answers to prepare the handout."))
    .toBeVisible();
});

it.each([
  ["Submit", "100 copies"],
  ["Double-click", "50 copies"],
  ["Skip", "Skipped"],
] as const)(
  "submits the question batch from the final step with %s",
  async (action, expected) => {
    const container = await mountConversationDemo({
      scenario: "question-batch",
    });
    const status = (step: number) =>
      page.getByText(`${step} of 3`, { exact: true });
    const waitForChoiceFlash = async () => {
      const [flash] = document.activeElement?.getAnimations() ?? [];
      expect(flash?.playState).toBe("running");
      await new Promise<void>((resolve) => {
        flash.addEventListener("finish", () => resolve(), { once: true });
      });
    };
    await expect.element(status(1)).toBeVisible();
    await expect
      .element(page.getByText("Format", { exact: true }))
      .not.toBeInTheDocument();
    await act(async () => {
      await page.getByRole("button", { name: /Compact/ }).click();
      await waitForChoiceFlash();
    });
    await expect.element(status(2)).toBeVisible();
    await expect
      .element(page.getByText("Map", { exact: true }))
      .not.toBeInTheDocument();

    await clickButton("Previous question");
    await expect.element(status(1)).toBeVisible();
    await act(async () => {
      await userEvent.keyboard("2");
      await waitForChoiceFlash();
    });
    await expect.element(status(2)).toBeVisible();
    await clickButton("Skip question");
    await expect.element(status(3)).toBeVisible();
    await expect
      .element(page.getByText("Copies", { exact: true }))
      .not.toBeInTheDocument();

    const copies = page.getByRole("radio", { name: "100 copies" });
    await act(async () => copies.click());
    await expect.element(copies).toHaveAttribute("aria-checked", "true");
    await expect.element(status(3)).toBeVisible();
    if (action === "Double-click") {
      await act(async () =>
        page.getByRole("radio", { name: "50 copies" }).dblClick()
      );
    } else {
      await clickButton(action);
    }
    await expect
      .element(page.getByText("I’ll use your answers to prepare the handout."))
      .toBeVisible();
    await expect.element(status(3)).not.toBeInTheDocument();
    await act(async () => page.getByRole("button", { name: /Worked/ }).click());
    const replies = [...conversation(container).querySelectorAll("blockquote")];
    const answerTo = (question: string) =>
      replies.find((reply) => reply.textContent === question)?.parentElement
        ?.textContent;
    expect(answerTo("Which format should the handout use?")).toContain(
      "Large print"
    );
    expect(answerTo("How many copies should the printer prepare?")).toContain(
      expected
    );
  }
);

async function clickButton(name: string) {
  await act(async () =>
    page.getByRole("button", { name, exact: true }).click()
  );
}

it("shows pending, refused and expired question answers through the production prompt", async () => {
  await mountConversationDemo({ scenario: "question" });
  const prompt = page.getByRole("textbox", {
    name: DesktopConversationFixtures.question.question,
  });
  const submit = page.getByRole("button", { name: "Submit", exact: true });
  await act(async () => {
    await page.getByRole("checkbox", { name: "Hold answer" }).click();
    await prompt.fill("A two-page handout");
    await submit.click();
  });
  await expect.element(submit).toBeDisabled();
  await clickButton("Refuse answer");
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent("Couldn't confirm the answer");
  await expect.element(prompt).toHaveValue("A two-page handout");
  await expect.element(submit).toBeEnabled();
  await clickButton("Expire question");
  await expect.element(prompt).not.toBeInTheDocument();
});

it("shows a blocking text-only question and the long and overlapping question variants", async () => {
  await mountConversationDemo({ scenario: "blocking-question" });
  await expect
    .element(
      page.getByRole("textbox", {
        name: "How many copies should the printer prepare?",
      })
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Close question" }))
    .toBeEnabled();
  await clickButton("Close question");
  await expect
    .element(page.getByText("I’ll leave the print quantity open for now."))
    .toBeVisible();

  await mountConversationDemo({ scenario: "multiple-questions" });
  const edition = page.getByRole("radiogroup", {
    name: /^Which edition of the gallery handout/,
  });
  await expect.element(edition).toBeVisible();
  expect(edition.getByRole("radio").all()).toHaveLength(6);
  const reopen = page.getByRole("button", { name: "Answer question" }).first();
  await act(async () => reopen.click());
  await expect
    .element(
      page.getByRole("textbox", {
        name: "Should the map include the accessible entrance?",
      })
    )
    .toBeVisible();
  await expect.element(edition).toBeVisible();
});

it("drives model and access loading, failure and retry from the actual composer controls", async () => {
  await mountDemo(<DesktopComposerDemo scenario="loading" />);
  const models = page.getByRole("group", { name: "Model read" });
  const access = page.getByRole("group", { name: "Access read" });
  await expect
    .element(page.getByRole("status", { name: "Loading models…" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("status", { name: "Checking access…" }))
    .toBeInTheDocument();
  await act(async () => models.getByRole("button", { name: "Fail" }).click());
  await act(async () => access.getByRole("button", { name: "Fail" }).click());
  await clickButton("Retry loading models");
  await act(async () =>
    models.getByRole("button", { name: "Complete" }).click()
  );
  await expect
    .element(page.getByRole("combobox", { name: "Model connection" }))
    .toHaveTextContent("Example model A");
  await clickButton("Access: Access unknown");
  await clickButton("Check access");
  await act(async () =>
    access.getByRole("button", { name: "Complete" }).click()
  );
  await expect
    .element(page.getByRole("button", { name: "Access: Full access" }))
    .toBeVisible();
});

it("selects OpenAI project billing separately and keeps the choice through rejected discovery", async () => {
  const model = "GPT-6.2 Sol";
  const subscription = {
    id: "subscription",
    connection: "ChatGPT Subscription",
    model,
  };
  const project = {
    id: "project",
    connection: "OpenAI API · Project billing",
    model,
  };
  let keyAccepted = true;
  const select = vi.fn<(selection: NativeChatProfileSelection) => void>();

  function PickerFixture() {
    const [active, setActive] = useState<string | null>(null);
    const [available, setAvailable] = useState(true);
    return (
      <NativeModelPicker
        profiles={{
          active,
          choices: available ? [subscription, project] : [subscription],
          saved: active === project.id ? [{ ...project, available }] : [],
          ...(!available && { openAiIssue: "keyRejected" }),
        }}
        busy={false}
        onSelect={(selection) => {
          select(selection);
          setActive(selection.kind === "default" ? null : selection.id);
        }}
        onRefresh={() => setAvailable(keyAccepted)}
      />
    );
  }

  await mountDemo(<PickerFixture />);
  const picker = page.getByRole("combobox", { name: "Model connection" });
  const projectChoice = page
    .getByRole("group", { name: project.connection })
    .getByRole("option", { name: /^GPT-6\.2 Sol/ });
  const subscriptionChoice = page
    .getByRole("group", { name: subscription.connection })
    .getByRole("option", { name: model });
  await act(async () => picker.click());
  await expect.element(subscriptionChoice).toBeVisible();
  await act(async () => projectChoice.click());
  expect(select).toHaveBeenCalledExactlyOnceWith({
    kind: "new",
    id: project.id,
  });
  await expect.element(picker).toHaveAttribute("aria-expanded", "false");

  keyAccepted = false;
  await act(async () => picker.click());
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent("OpenAI rejected the project key.");
  await expect.element(projectChoice).toHaveAttribute("aria-disabled", "true");

  keyAccepted = true;
  await clickButton("Retry");
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  await expect.element(projectChoice).toHaveAttribute("aria-disabled", "false");
  await act(async () =>
    page.getByRole("option", { name: "Show all models" }).click()
  );
  await expect
    .element(subscriptionChoice)
    .toHaveAttribute("aria-disabled", "false");
  expect(select).toHaveBeenCalledTimes(1);
});

it("keeps other models selectable and refreshes OpenAI while discovery runs", async () => {
  const subscription = {
    id: "subscription",
    connection: "ChatGPT Subscription",
    model: "Subscription model",
  };
  const project = {
    id: "project",
    connection: "OpenAI API · Project billing",
    model: "Project model",
  };
  const select = vi.fn<(selection: NativeChatProfileSelection) => void>();
  const refreshed = Promise.withResolvers<void>();
  let discovered = false;

  function PickerFixture() {
    const [ready, setReady] = useState(false);
    return (
      <NativeModelPicker
        profiles={{
          active: null,
          choices: ready ? [subscription, project] : [subscription],
          saved: [],
          openAiIssue: ready ? undefined : "loading",
        }}
        busy={false}
        onSelect={select}
        onRefresh={() => {
          if (!discovered) return;
          setReady(true);
          refreshed.resolve();
        }}
      />
    );
  }

  await mountDemo(<PickerFixture />);
  const picker = page.getByRole("combobox", { name: "Model connection" });
  const loading = page.getByText("Loading OpenAI API models…");
  const subscriptionChoice = page.getByRole("option", {
    name: subscription.model,
  });
  const projectChoice = page.getByRole("option", { name: project.model });
  await act(async () => picker.click());
  await expect.element(loading).toBeVisible();
  await expect.element(projectChoice).not.toBeInTheDocument();
  await act(async () => subscriptionChoice.click());
  expect(select).toHaveBeenCalledExactlyOnceWith({
    kind: "new",
    id: subscription.id,
  });

  await act(async () => picker.click());
  await expect.element(loading).toBeVisible();
  discovered = true;
  await act(async () => refreshed.promise);
  await expect.element(projectChoice).toBeVisible();
  await expect.element(subscriptionChoice).toBeVisible();
  await expect.element(loading).not.toBeInTheDocument();
});

it("demonstrates disconnecting, failing a reconnect and restoring the same chat", async () => {
  const container = await mountConversationDemo({ scenario: "reconnect" });
  const composer = container.querySelector<HTMLElement>(
    "[data-composer-editor]"
  )!;
  await act(async () => userEvent.fill(composer, "Keep this draft"));
  await clickButton("Disconnect");
  await expect
    .element(page.getByText("Reconnecting to this chat…"))
    .toBeVisible();
  await clickButton("Fail");
  await expect
    .element(
      page.getByText(
        "This chat is disconnected. Saved messages are still visible."
      )
    )
    .toBeVisible();
  await clickButton("Reconnect");
  await clickButton("Complete");
  await expect
    .element(page.getByRole("button", { name: "Disconnect" }))
    .toBeVisible();
  await expect
    .element(page.getByText("Reconnecting to this chat…"))
    .not.toBeInTheDocument();
  expect(composer.textContent).toBe("Keep this draft");
});

it("uses the actual approval and Library prompts with local responses", async () => {
  await mountConversationDemo({ scenario: "approval" });
  await clickButton("Decline");
  await expect
    .element(
      page.getByText("I’ll prepare the handout without the printer notes.")
    )
    .toBeVisible();

  await mountConversationDemo({ scenario: "library-request" });
  await clickButton("Choose reference");
  const picker = page.getByRole("dialog", {
    name: "Choose a Library reference",
  });
  await expect
    .element(picker.getByRole("searchbox", { name: "Search the Library" }))
    .toHaveValue("Gallery cover");
  await act(async () =>
    picker.getByRole("button", { name: "Add to selection" }).click()
  );
  await act(async () =>
    picker.getByRole("button", { name: "Use reference" }).click()
  );
  await expect.element(picker).not.toBeInTheDocument();
  await expect
    .element(
      page.getByText("I’ll use the selected Library image for the cover.")
    )
    .toBeVisible();
});

it("focuses the ordinary draft and queued edits from the composer padding", async () => {
  const container = await mountConversationDemo();
  const editor = container.querySelector<HTMLElement>(
    "[data-composer-editor]"
  )!;
  const padding = container.querySelector<HTMLElement>(
    "[data-composer-content]"
  )!;
  const composer = padding.closest<HTMLElement>("[data-composer-menu-anchor]")!;
  const add = composer.querySelector<HTMLButtonElement>(
    'button[aria-label="Add to message"]'
  )!;
  const pointerDown = (target: HTMLElement) =>
    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        isPrimary: true,
        button: 0,
      })
    );

  for (const background of [composer, padding]) {
    await act(async () => {
      runningTurn(container).focus();
      pointerDown(background);
      await expect.poll(() => document.activeElement === editor).toBe(true);
    });
  }
  await act(async () => {
    runningTurn(container).focus();
    padding.click();
    await expect.poll(() => document.activeElement === editor).toBe(true);
  });

  await act(async () => {
    editor.focus();
    await userEvent.keyboard("Draft{Shift>}{ArrowLeft>5/}{/Shift}");
  });
  expect(document.getSelection()?.toString()).toBe("Draft");
  await act(async () => {
    pointerDown(editor);
  });
  expect(document.getSelection()?.toString()).toBe("Draft");
  await act(async () => {
    pointerDown(padding);
    await expect.poll(() => document.activeElement === editor).toBe(true);
  });
  expect(document.getSelection()?.isCollapsed).toBe(true);

  await editQueuedMessage(container);
  await act(async () => {
    runningTurn(container).focus();
    composer.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
    );
    await expect.poll(() => document.activeElement === editor).toBe(true);
  });

  await openAddMenu(container);
  expect(document.activeElement).not.toBe(editor);
  expect(add.getAttribute("aria-expanded")).toBe("true");
});

it("confirms Pause with two distinct Escape presses while the composer is focused", async () => {
  const container = await mountConversationDemo();
  const editor = container.querySelector<HTMLElement>(
    "[data-composer-editor]"
  )!;
  const pause = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Pause"]'
  )!;

  await openAddMenu(container);
  await act(async () => userEvent.keyboard("{Escape}"));
  expect(container.querySelector("[data-composer-action-menu]")).toBeNull();
  expect(pause.textContent).toBe("");

  await act(async () => {
    await userEvent.hover(editor);
    editor.focus();
    await userEvent.keyboard("{Escape}");
  });
  expect(pause.textContent).toBe("Esc");
  expect(runningTurn(container).checked).toBe(true);

  await act(async () => {
    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        repeat: true,
      })
    );
  });
  expect(runningTurn(container).checked).toBe(true);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2100));
  });
  expect(pause.textContent).toBe("");
  expect(runningTurn(container).checked).toBe(true);

  await act(async () => {
    editor.focus();
    await userEvent.keyboard("{Escape}");
  });
  expect(pause.textContent).toBe("Esc");
  await act(async () => userEvent.keyboard("{Escape}"));
  expect(runningTurn(container).checked).toBe(false);

  await act(async () =>
    page.getByRole("button", { name: "Resume", exact: true }).click()
  );
  const resumePause = page.getByRole("button", { name: "Pause" });
  await expect.element(resumePause).toBeEnabled();
  await act(async () => resumePause.click());
  expect(runningTurn(container).checked).toBe(false);
});

async function editSentMessage(container: HTMLElement) {
  const transcript = conversation(container);
  const trigger = Array.from(
    transcript.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => button.textContent?.trim() === "Edit and resubmit")!;
  await act(async () => {
    await userEvent.hover(trigger.closest(".is-user")!);
    await userEvent.click(trigger);
  });
  return transcript.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Replacement message"]'
  )!;
}

it("edits the sent bubble inline, cancels without changing it and resubmits multiline text without replacing the composer draft", async () => {
  const container = await mountConversationDemo({});
  const composer = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  await act(async () => userEvent.fill(composer, "Keep this unsent draft"));
  const original = conversation(container).textContent;
  let editor = await editSentMessage(container);
  expect(editor).not.toBeNull();
  expect(conversation(container).contains(editor)).toBe(true);
  expect(editor.closest("form")?.textContent).toContain(
    "Replaces this and 1 later message. Completed work isn’t undone."
  );
  expect(document.activeElement).toBe(editor);
  expect(editor.selectionStart).toBe(editor.value.length);
  expect(editor.selectionEnd).toBe(editor.value.length);
  await act(async () => {
    editor.setSelectionRange(7, 7);
    await userEvent.keyboard(" inserted ");
  });
  expect(editor.selectionStart).toBe(17);
  expect(editor.selectionEnd).toBe(17);
  await act(async () => userEvent.fill(editor, "Discard this edit"));
  const form = editor.closest("form")!;
  await act(async () => userEvent.click(textButton(form, "Cancel")));
  expect(conversation(container).querySelector("textarea")).toBeNull();
  expect(conversation(container).textContent).toBe(original);
  expect(composer.textContent).toBe("Keep this unsent draft");

  editor = await editSentMessage(container);
  await act(async () => {
    await userEvent.fill(editor, "A revised request");
    await userEvent.keyboard("{End}{Shift>}{Enter}{/Shift}With a second line");
  });
  expect(editor.value).toBe("A revised request\nWith a second line");
  await act(async () => userEvent.keyboard("{Enter}"));
  await expect
    .poll(() => conversation(container).querySelector("textarea"))
    .toBeNull();
  expect(conversation(container).textContent).toContain("A revised request");
  expect(conversation(container).textContent).toContain("With a second line");
  expect(conversation(container).textContent).not.toContain("Composer review");
  expect(composer.textContent).toBe("Keep this unsent draft");
});

it("keeps the inline editor open when Enter confirms IME composition", async () => {
  const container = await mountConversationDemo({});
  const editor = await editSentMessage(container);
  await act(async () => {
    await userEvent.fill(editor, "Composition in progress");
    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        isComposing: true,
      })
    );
  });
  expect(conversation(container).querySelector("textarea")).toBe(editor);
  expect(editor.value).toBe("Composition in progress");
  await act(async () => userEvent.keyboard("{Enter}"));
  await expect
    .poll(() => conversation(container).querySelector("textarea"))
    .toBeNull();
  expect(conversation(container).textContent).toContain(
    "Composition in progress"
  );
});

it("keeps inline edits on refusal and shows pending Send before acknowledgement", async () => {
  const container = await mountConversationDemo({});
  const hold = Array.from(container.querySelectorAll("label"))
    .find((label) => label.textContent?.includes("Hold submission"))!
    .querySelector<HTMLInputElement>("input")!;
  await act(async () => userEvent.click(hold));
  const editor = await editSentMessage(container);
  await act(async () => userEvent.fill(editor, "Keep the revised request"));
  const form = editor.closest("form")!;
  await act(async () => userEvent.click(textButton(form, "Send")));
  expect(editor.readOnly).toBe(true);
  expect(textButton(form, "Cancel").disabled).toBe(true);
  expect(form.getAttribute("aria-busy")).toBe("true");
  await act(async () =>
    userEvent.click(textButton(container, "Refuse submission"))
  );
  await expect.poll(() => editor.readOnly).toBe(false);
  expect(editor.value).toBe("Keep the revised request");
  expect(container.textContent).toContain("Couldn't revise this message.");
  await act(async () => userEvent.click(textButton(form, "Send")));
  await act(async () =>
    userEvent.click(textButton(container, "Accept submission"))
  );
  await expect
    .poll(() => conversation(container).querySelector("textarea"))
    .toBeNull();
  expect(conversation(container).textContent).toContain(
    "Keep the revised request"
  );
});

it("mounts the production composer without a native bridge and offers full queued text locally", async () => {
  const container = await mountConversationDemo();
  await expect
    .poll(() => container.querySelector('[contenteditable="true"]'))
    .not.toBeNull();
  await expect
    .poll(
      () =>
        container.querySelector<HTMLImageElement>('img[alt="reference.jpg"]')
          ?.src
    )
    .toMatch(/^data:image\//);
  const preview = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Preview queued message"]'
  )!;
  await act(async () => {
    preview.click();
  });
  await expect
    .poll(() =>
      Array.from(document.querySelectorAll("p")).some(
        (element) =>
          element.textContent?.includes(
            "Keep this entire queued message readable."
          ) && element.className.includes("whitespace-pre-wrap")
      )
    )
    .toBe(true);
  expect(
    container.querySelectorAll('button[aria-label="Preview queued message"]')
  ).toHaveLength(3);
});

it("uses the shared + panel at the production composer anchor", async () => {
  const container = await mountConversationDemo();
  const add = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Add to message"]'
  )!;
  await act(async () => {
    add.click();
  });
  const panel = container.querySelector<HTMLElement>(
    "[data-composer-action-menu]"
  );
  expect(panel).not.toBeNull();
  expect(panel?.parentElement?.hasAttribute("data-composer-menu-anchor")).toBe(
    true
  );
  const plan = menuItem(panel!, "Plan mode");
  await act(async () => plan.click());
  expect(container.querySelector("[data-composer-action-menu]")).toBeNull();
  expect(
    container.querySelector('button[aria-label="Remove plan"]')
  ).not.toBeNull();
});

it("reorders the production queue with its keyboard handle and resets the examples", async () => {
  const container = await mountConversationDemo();
  const queue = container.querySelector<HTMLElement>(
    '[data-testid="native-composer-queue"]'
  )!;
  const previews = () => queuedPreviews(container);
  const grip = queue.querySelector<HTMLButtonElement>(
    'button[aria-label="Reorder queued message"]'
  )!;
  expect(previews()[0].textContent).toContain("Check the composer");
  await expect
    .poll(() => {
      const image = queue.querySelector<HTMLImageElement>(
        'img[alt="reference.jpg"]'
      );
      return !!image && image.complete && image.naturalWidth > 0;
    })
    .toBe(true);
  // This runner omits Tailwind. Use the same thumbnail dimensions as the
  // application so keyboard collision detection sees the real row geometry.
  const thumbnail = queue.querySelector<HTMLImageElement>(
    'img[alt="reference.jpg"]'
  )!;
  thumbnail.width = 28;
  thumbnail.height = 28;
  await act(async () => {
    grip.focus();
    await userEvent.keyboard("[Space]");
    // The keyboard sensor installs its document listener after activation.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(grip.getAttribute("aria-pressed")).toBe("true");
  await act(async () => {
    await userEvent.keyboard("{ArrowDown}");
  });
  // The keyboard sensor may scroll first; drop only after it reaches the row.
  await expect
    .poll(() => document.querySelector('[aria-live="assertive"]')?.textContent)
    .toContain("was moved over droppable area image.");
  await act(async () => {
    await userEvent.keyboard("[Space]");
  });
  await expect
    .poll(() => previews()[0].textContent)
    .toContain("Use this image as the visual reference.");
  expect(previews()[1].textContent).toContain("Check the composer");
  await expect
    .poll(() => previews()[0].querySelector('img[alt="reference.jpg"]'))
    .not.toBeNull();
  const reset = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Reset"
  )!;
  await act(async () => reset.click());
  await expect
    .poll(() => previews()[0]?.textContent)
    .toContain("Check the composer");
  expect(previews()).toHaveLength(3);
});

it("demonstrates steering an image into the running transcript and resetting", async () => {
  const container = await mountConversationDemo();
  const steeringButtons = () =>
    Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="native-composer-queue"] button'
      )
    ).filter((button) => button.textContent?.trim() === "Steer");
  const previews = () => queuedPreviews(container);
  const running = Array.from(container.querySelectorAll("label"))
    .find((label) => label.textContent?.includes("Running turn"))!
    .querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(running.checked).toBe(true);
  expect(steeringButtons()).toHaveLength(2);
  const imageRowMenu = await openQueueActions(container, 1);
  const moveUp = Array.from(
    imageRowMenu.querySelectorAll<HTMLElement>('[role="menuitem"]')
  ).find((item) => item.textContent?.trim() === "Move up")!;
  await act(async () => {
    moveUp.focus();
    await userEvent.keyboard("{Enter}");
  });
  await expect
    .poll(() => previews()[0].textContent)
    .toContain("Use this image as the visual reference.");
  const steerImage = queuedSteer(previews()[0])!;
  await expect.poll(() => steerImage.disabled).toBe(false);
  await act(async () => steerImage.click());
  await expect.poll(() => previews().length).toBe(2);
  const transcript = conversation(container);
  await expect
    .poll(() => transcript.textContent)
    .toContain("Use this image as the visual reference.");
  await expect
    .poll(() => {
      const image = transcript.querySelector<HTMLImageElement>(
        'img[alt="reference.jpg"]'
      );
      return !!image && image.complete && image.naturalWidth > 0;
    })
    .toBe(true);
  expect(container.querySelector('[contenteditable="true"]')?.textContent).toBe(
    ""
  );

  await act(async () => running.click());
  expect(running.checked).toBe(false);
  await expect.poll(steeringButtons).toHaveLength(0);
  const reset = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Reset"
  )!;
  await act(async () => reset.click());
  expect(running.checked).toBe(true);
  await expect.poll(previews).toHaveLength(3);
  await expect.poll(steeringButtons).toHaveLength(2);
  expect(conversation(container).textContent).not.toContain(
    fixtures.queue[1].text
  );
});

it("renders production Markdown, recorded work, streaming and empty conversation states", async () => {
  let container = await mountConversationDemo({});
  await expect
    .poll(() => conversation(container).querySelector("h3")?.textContent)
    .toBe("Composer review");
  expect(conversation(container).getAttribute("role")).toBe("log");
  expect(
    conversation(container).querySelector(
      '[role="group"][aria-label="Message text"]'
    )?.textContent
  ).toContain("Refine this composer.");
  expect(conversation(container).querySelector("li")?.textContent).toContain(
    "Open"
  );
  await expect
    .poll(() =>
      Array.from(conversation(container).querySelectorAll("code")).some(
        (code) =>
          code.textContent?.includes(
            'const message = { text: "Keep the draft" };'
          )
      )
    )
    .toBe(true);

  container = await mountConversationDemo({ scenario: "activity" });
  const activity = conversation(container).querySelector<HTMLElement>(
    '[data-testid="native-turn-activity"]'
  )!;
  expect(activity.getAttribute("data-state")).toBe("collapsed");
  expect(activity.textContent).toContain("The example preserves the draft");
  expect(activity.textContent).not.toContain(
    "I’ll read the notes, then check the example."
  );
  const work = Array.from(
    activity.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => button.textContent?.includes("Worked for 5s"))!;
  await act(async () => work.click());
  expect(activity.getAttribute("data-state")).toBe("expanded");
  expect(activity.textContent).toContain(
    "I’ll read the notes, then check the example."
  );

  container = await mountConversationDemo({ scenario: "subagents" });
  const transcript = conversation(container);
  await act(async () =>
    page.getByRole("button", { name: "Worked for 12s" }).click()
  );
  const started = page.getByRole("button", {
    name: "Layout review started working",
  });
  const finished = page.getByRole("button", { name: "Layout review finished" });
  await expect.element(started).toBeVisible();
  await expect.element(finished).toBeVisible();
  expect(transcript.textContent?.replace(/\s+/g, " ")).toMatch(
    /Layout review started working.*Copy review started working.*Read.*Accessibility review started working.*Copy review failed.*Accessibility review stopped.*Layout review finished/
  );
  await act(async () => finished.click());
  await expect.element(finished).toBeVisible();
  expect(
    container.querySelector('[data-testid="native-subagent-conversation"]')
  ).toBeNull();

  container = await mountConversationDemo({ scenario: "streaming" });
  const assistant =
    conversation(container).querySelector<HTMLElement>(".is-assistant")!;
  expect(assistant.textContent).toContain(
    "Next I’ll compare the narrow layout and"
  );
  expect(
    Array.from(assistant.querySelectorAll("button")).some(
      (button) => button.textContent?.trim() === "Copy"
    )
  ).toBe(false);
  const running = Array.from(container.querySelectorAll("label"))
    .find((label) => label.textContent?.includes("Streaming"))!
    .querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => running.click());
  await expect
    .poll(
      () => conversation(container).querySelector(".is-assistant")?.textContent
    )
    .toContain("Copy");

  container = await mountConversationDemo({ scenario: "empty" });
  expect(container.querySelector('[contenteditable="true"]')).not.toBeNull();
  expect(
    conversation(container).querySelector('[aria-label="Message text"]')
  ).toBeNull();
  expect(
    conversation(container).querySelector('[aria-label="Message attachments"]')
  ).toBeNull();
});

it("shows the slide text selection in the composer until it is cleared", async () => {
  const container = await mountConversationDemo({ scenario: "svg-selection" });
  const surface = container.querySelector<HTMLElement>(
    '[data-testid="workspace-native-chat"]'
  )!;
  const transcript = conversation(container);
  const clearButton = () =>
    surface.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear selection"]'
    );
  const sentMarkers = () =>
    Array.from(transcript.querySelectorAll("span")).filter(
      (span) => span.childElementCount === 0 && span.textContent === "Selection"
    ).length;
  expect(clearButton()?.parentElement?.textContent).toBe("Quiet tide");
  expect(sentMarkers()).toBe(1);

  await selectAddMenuAction(container, "Plan mode");
  expect(clearButton()).toBeNull();
  await selectAddMenuAction(container, "Plan mode");
  expect(clearButton()?.parentElement?.textContent).toBe("Quiet tide");

  const composer = surface.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const selection = Array.from(container.querySelectorAll("label"))
    .find((label) => label.textContent?.trim() === "Slide item selected")!
    .querySelector("input")!;
  const send = async (text: string) =>
    act(async () => {
      await userEvent.fill(composer, text);
      await userEvent.click(
        surface.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
      );
    });
  await send("Read this selection.");
  await expect
    .poll(() => transcript.textContent)
    .toContain("Read this selection.");
  await expect.poll(sentMarkers).toBe(2);
  await act(async () =>
    userEvent.fill(composer, "This message has no selection.")
  );
  expect(transcript.querySelector('[aria-label="Clear selection"]')).toBeNull();
  await act(async () => userEvent.click(clearButton()!));
  expect(selection.checked).toBe(false);
  expect(clearButton()).toBeNull();
  expect(composer.textContent).toBe("This message has no selection.");
  expect(document.activeElement).toBe(composer);

  await act(async () =>
    userEvent.click(
      surface.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
    )
  );
  await expect
    .poll(() => transcript.textContent)
    .toContain("This message has no selection.");
  expect(sentMarkers()).toBe(2);
  expect(
    transcript.querySelector('[aria-label="Message attachments"]')
  ).toBeNull();
});

it("uses production attachment cards, retained-image loading and fullscreen inspection", async () => {
  const container = await mountConversationDemo({ scenario: "attachments" });
  const transcript = conversation(container);
  const captions = Array.from(transcript.querySelectorAll("figcaption"));
  expect(
    captions.some(
      (caption) =>
        caption.textContent?.includes("README.md") &&
        caption.textContent.includes("File")
    )
  ).toBe(true);
  expect(
    captions.some(
      (caption) =>
        caption.textContent?.includes("assets") &&
        caption.textContent.includes("Folder")
    )
  ).toBe(true);
  const imageButtons = transcript.querySelectorAll<HTMLButtonElement>(
    'button[title="Preview reference.jpg"]'
  );
  expect(imageButtons).toHaveLength(2);
  expect(
    imageButtons[0]
      .closest(".is-user")
      ?.querySelector('[aria-label="Message text"]')?.textContent
  ).toContain("Use this image as the visual reference.");
  expect(
    imageButtons[1]
      .closest(".is-user")
      ?.querySelector('[aria-label="Message text"]')
  ).toBeNull();

  const unavailable = transcript.querySelector<HTMLButtonElement>(
    'button[title="Preview unavailable-reference.jpg"]'
  )!;
  await act(async () => unavailable.scrollIntoView({ block: "center" }));
  await expect
    .poll(() => unavailable.textContent)
    .toContain("Preview unavailable");
  expect(unavailable.textContent).toContain("unavailable-reference.jpg");

  await act(async () => imageButtons[0].scrollIntoView({ block: "center" }));
  await expect
    .poll(
      () =>
        imageButtons[0].querySelector<HTMLImageElement>(
          'img[alt="reference.jpg"]'
        )?.src
    )
    .toMatch(/^blob:/);
  await act(async () => imageButtons[0].click());
  await expect
    .poll(() => document.querySelector('[data-testid="dialog-image-preview"]'))
    .not.toBeNull();
  const dialog = document.querySelector<HTMLElement>(
    '[data-testid="dialog-image-preview"]'
  )!;
  expect(dialog.getAttribute("role")).toBe("dialog");
  await expect
    .poll(
      () =>
        dialog.querySelector<HTMLImageElement>('img[alt="reference.jpg"]')?.src
    )
    .toMatch(/^blob:/);
  expect(
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Copy image"]')
      ?.disabled
  ).toBe(false);
  expect(
    dialog.querySelector<HTMLButtonElement>(
      'button[aria-label="Download image"]'
    )?.disabled
  ).toBe(false);
  await act(async () =>
    dialog
      .querySelector<HTMLButtonElement>('button[aria-label="Close"]')!
      .click()
  );
  await expect
    .poll(() => document.querySelector('[data-testid="dialog-image-preview"]'))
    .toBeNull();
});

it("sends a staged image into the real user transcript in the idle local fixture", async () => {
  const container = await mountConversationDemo({ scenario: "empty" });
  await stageAttachment(container, "image");
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  await act(async () =>
    userEvent.fill(
      editor,
      "Inspect this local image without starting an agent."
    )
  );
  const send = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Send"]'
  )!;
  expect(send.disabled).toBe(false);
  await act(async () => send.click());
  const transcript = conversation(container);
  await expect
    .poll(
      () => transcript.querySelector('[aria-label="Message text"]')?.textContent
    )
    .toContain("Inspect this local image without starting an agent.");
  expect(
    transcript.querySelectorAll('ul[aria-label="Message attachments"]')
  ).toHaveLength(1);
  const preview = transcript.querySelector<HTMLButtonElement>(
    'button[title="Preview reference.jpg"]'
  )!;
  await act(async () => preview.scrollIntoView({ block: "center" }));
  await expect
    .poll(
      () =>
        preview.querySelector<HTMLImageElement>('img[alt="reference.jpg"]')?.src
    )
    .toMatch(/^blob:/);
  expect(editor.textContent).toBe("");
  expect(
    container.querySelector('button[aria-label="Remove reference.jpg"]')
  ).toBeNull();
});

it("keeps the draft while shared + tools combine, toggle and remove Goal and Plan", async () => {
  const container = await mountConversationDemo();
  await act(async () => runningTurn(container).click());
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const draft = "Keep this draft while switching composer intent.";
  await act(async () => userEvent.fill(editor, draft));

  const goal = menuItem(await openAddMenu(container), "Goal");
  expect(goal.querySelector("svg")).not.toBeNull();
  expect(goal.textContent).toContain("Set a goal to keep pursuing");
  await act(async () => goal.click());
  const removeGoal = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove goal"]'
  )!;
  expect(removeGoal.textContent).toBe("Goal");
  expect(removeGoal.querySelector("svg")).not.toBeNull();
  expect(editor.textContent).toBe(draft);

  const plan = menuItem(await openAddMenu(container), "Plan mode");
  expect(plan.textContent).toContain("Turn plan mode on");
  expect(plan.querySelector("svg")).not.toBeNull();
  await act(async () => plan.click());
  expect(
    container.querySelector('button[aria-label="Remove goal"]')
  ).not.toBeNull();
  const removePlan = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove plan"]'
  )!;
  expect(removePlan.textContent).toBe("Plan");
  expect(removePlan.querySelector("svg")).not.toBeNull();
  expect(editor.textContent).toBe(draft);

  const disablePlan = menuItem(await openAddMenu(container), "Plan mode");
  expect(disablePlan.textContent).toContain("Turn plan mode off");
  await act(async () => disablePlan.click());
  expect(
    container.querySelector('button[aria-label="Remove plan"]')
  ).toBeNull();
  expect(
    container.querySelector('button[aria-label="Remove goal"]')
  ).not.toBeNull();
  expect(editor.textContent).toBe(draft);

  const enablePlan = menuItem(await openAddMenu(container), "Plan mode");
  await act(async () => enablePlan.click());
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Remove goal"]')!
      .click()
  );
  expect(
    container.querySelector('button[aria-label="Remove goal"]')
  ).toBeNull();
  expect(
    container.querySelector('button[aria-label="Remove plan"]')
  ).not.toBeNull();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Remove plan"]')!
      .click()
  );
  expect(
    container.querySelector('button[aria-label="Remove plan"]')
  ).toBeNull();
  expect(editor.textContent).toBe(draft);
});

it("keeps the shared placeholder across modes and attachments with Ask for approval", async () => {
  const container = await mountConversationDemo();
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const placeholder = () =>
    editor
      .querySelector("[data-placeholder]")
      ?.getAttribute("data-placeholder");
  expect(placeholder()).toBe("Ask anything…");
  await act(async () => runningTurn(container).click());

  const goal = menuItem(await openAddMenu(container), "Goal");
  await act(async () => goal.click());
  await expect.poll(placeholder).toBe("Ask anything…");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Remove goal"]')!
      .click()
  );
  const plan = menuItem(await openAddMenu(container), "Plan mode");
  await act(async () => plan.click());
  await expect.poll(placeholder).toBe("Ask anything…");
  const goalWithPlan = menuItem(await openAddMenu(container), "Goal");
  await act(async () => goalWithPlan.click());
  await expect.poll(placeholder).toBe("Ask anything…");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Remove goal"]')!
      .click()
  );
  await expect.poll(placeholder).toBe("Ask anything…");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Remove plan"]')!
      .click()
  );

  await stageAttachment(container, "image");
  await expect.poll(placeholder).toBe("Ask anything…");
  const blockedGoal = menuItem(await openAddMenu(container), "Goal");
  await act(async () => blockedGoal.click());
  expect(container.textContent).toContain(
    "Send or remove the attachment before starting a goal."
  );
  expect(
    container.querySelector('button[aria-label="Remove goal"]')
  ).toBeNull();
  await expect
    .poll(() => container.querySelector("[data-composer-action-menu]"))
    .toBeNull();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Remove reference.jpg"]'
      )!
      .click()
  );

  const access = page.getByRole("button", { name: "Access: Ask for approval" });
  await expect.element(access).toBeEnabled();
  expect(access.element().querySelector("svg")).not.toBeNull();
  await clickButton("Access: Ask for approval");
  const dialog = page.getByRole("dialog");
  await expect.element(dialog).toHaveTextContent("Access for new messages");
  await expect
    .element(dialog)
    .toHaveTextContent(
      "Reads and edits project files and runs sandboxed commands. You review requests for extra access."
    );
  await act(async () => userEvent.keyboard("{Escape}"));
  await expect.element(dialog).not.toBeInTheDocument();
});

it("selects slash Goal and Plan without consuming the surrounding draft", async () => {
  const container = await mountConversationDemo();
  await act(async () => runningTurn(container).click());
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const draft = "Keep the text I already wrote.";
  await act(async () => userEvent.fill(editor, `${draft} /goal`));
  await expect
    .poll(() => container.querySelector("[data-composer-trigger-menu]"))
    .not.toBeNull();
  const goalMenu = container.querySelector<HTMLElement>(
    "[data-composer-trigger-menu]"
  )!;
  await act(async () => menuItem(goalMenu, "goal").click());
  expect(container.querySelector("[data-composer-trigger-menu]")).toBeNull();
  expect(editor.textContent?.trim()).toBe(draft);
  const removeGoal = container.querySelector(
    'button[aria-label="Remove goal"]'
  );
  expect(removeGoal).not.toBeNull();
  expect(removeGoal!.querySelector("svg")).not.toBeNull();

  await act(async () => userEvent.fill(editor, `${draft} /plan`));
  await expect
    .poll(() => container.querySelector("[data-composer-trigger-menu]"))
    .not.toBeNull();
  const planMenu = container.querySelector<HTMLElement>(
    "[data-composer-trigger-menu]"
  )!;
  await act(async () => menuItem(planMenu, "plan").click());
  expect(container.querySelector("[data-composer-trigger-menu]")).toBeNull();
  expect(editor.textContent?.trim()).toBe(draft);
  expect(
    container.querySelector('button[aria-label="Remove goal"]')
  ).not.toBeNull();
  const removePlan = container.querySelector(
    'button[aria-label="Remove plan"]'
  );
  expect(removePlan).not.toBeNull();
  expect(removePlan!.querySelector("svg")).not.toBeNull();
});

it("sends Plan input to the running-turn queue with its label and steering restriction", async () => {
  const container = await mountConversationDemo();
  expect(runningTurn(container).checked).toBe(true);
  expect(container.querySelector('button[aria-label="Pause"]')).not.toBeNull();
  expect(container.querySelector('button[aria-label="Send"]')).toBeNull();
  const plan = menuItem(await openAddMenu(container), "Plan mode");
  await act(async () => plan.click());
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const text = "Compare compact and spacious composer layouts.";
  await act(async () => userEvent.fill(editor, text));
  const send = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Send"]'
  )!;
  expect(send.disabled).toBe(false);
  await act(async () => send.click());
  await expect
    .poll(() => queuedPreviews(container)[3]?.textContent)
    .toBe(`Plan · ${text}`);
  expect(queuedSteer(queuedPreviews(container)[3])).toBeUndefined();
  expect(editor.textContent).toBe("");
  expect(runningTurn(container).checked).toBe(true);
  expect(container.querySelector('button[aria-label="Pause"]')).not.toBeNull();
  expect(conversation(container).textContent).not.toContain(text);
});

it("edits queued text in the existing composer and restores its unsent draft after saving", async () => {
  const container = await mountConversationDemo();
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const draft = "Keep this unsent follow-up while I edit the queue.";
  await act(async () => userEvent.fill(editor, draft));
  const send = sendButton(container);
  await editQueuedMessage(container);
  expect(sendButton(container)).toBe(send);
  expect(container.textContent).not.toContain("Editing queued message");
  expect(
    container.querySelector('button[aria-label="Cancel edit"]')
  ).toBeNull();
  expect(container.querySelectorAll('[contenteditable="true"]')).toHaveLength(
    1
  );
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
  expect(
    container.querySelector('[data-testid="native-composer-queue"] textarea')
  ).toBeNull();
  expect(editor.innerText.replace(/\s+/g, " ").trim()).toBe(
    fixtures.queue[0].text.replace(/\s+/g, " ").trim()
  );
  const replacement = "Check the revised composer spacing before sending.";
  await act(async () => userEvent.fill(editor, replacement));
  expect(send.disabled).toBe(false);
  await act(async () => userEvent.click(send));
  await expect
    .poll(() => queuedPreviews(container)[0].textContent)
    .toBe(replacement);
  expect(queuedPreviews(container)).toHaveLength(3);
  await expect.poll(() => editor.textContent).toBe(draft);
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
  expect(container.textContent).not.toContain("Editing queued message");
});

it("keeps staged image and Plan context separate from a queued text replacement", async () => {
  const container = await mountConversationDemo();
  const plan = menuItem(await openAddMenu(container), "Plan mode");
  await act(async () => userEvent.click(plan));
  await stageAttachment(container, "image");
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const draft = "Keep this image for my next planned follow-up.";
  await act(async () => userEvent.fill(editor, draft));
  await editQueuedMessage(container);
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
  expect(
    container.querySelector('button[aria-label="Remove reference.jpg"]')
  ).toBeNull();
  expect(
    container.querySelector('button[aria-label="Remove plan"]')
  ).toBeNull();
  expect(
    container.querySelector('button[aria-label="Add to message"]')
  ).not.toBeNull();
  expect(
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="Model connection"]'
    )?.disabled
  ).toBe(true);
  expect(
    container.querySelector<HTMLButtonElement>('button[aria-label^="Access:"]')
      ?.disabled
  ).toBe(true);
  await act(async () => userEvent.fill(editor, "/plan"));
  expect(container.querySelector("[data-composer-trigger-menu]")).toBeNull();
  const replacement = "Replace only the queued text.";
  await act(async () => userEvent.fill(editor, replacement));
  await act(async () => userEvent.click(sendButton(container)));
  await expect
    .poll(() => queuedPreviews(container)[0].textContent)
    .toBe(replacement);
  const preview = queuedPreviews(container)[0];
  expect(preview.querySelector("img")).toBeNull();
  expect(queuedSteer(preview)?.disabled).toBe(false);
  expect(editor.textContent).toBe(draft);
  expect(
    container.querySelector('button[aria-label="Remove reference.jpg"]')
  ).not.toBeNull();
  expect(
    container.querySelector('button[aria-label="Remove plan"]')
  ).not.toBeNull();
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
});

it("cancels queue edits while restoring ordinary intent and attachment context", async () => {
  const container = await mountConversationDemo();
  const plan = menuItem(await openAddMenu(container), "Plan mode");
  await act(async () => userEvent.click(plan));
  await stageAttachment(container, "image");
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const draft = "This ordinary draft must survive either cancellation.";
  await act(async () => userEvent.fill(editor, draft));
  const original = queuedPreviews(container)[0].textContent;
  await editQueuedMessage(container);
  await act(async () => userEvent.fill(editor, "Discard this queued edit."));
  await act(async () => userEvent.keyboard("{Escape}"));
  await expect.poll(() => editor.textContent).toBe(draft);
  expect(queuedPreviews(container)[0].textContent).toBe(original);
  expect(
    container.querySelector('button[aria-label="Remove reference.jpg"]')
  ).not.toBeNull();
  expect(
    container.querySelector('button[aria-label="Remove plan"]')
  ).not.toBeNull();
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);

  const attachmentMenu = await openQueueActions(container, 1);
  const attachmentEdit = Array.from(
    attachmentMenu.querySelectorAll<HTMLElement>('[role="menuitem"]')
  ).find((item) => item.textContent?.trim() === "Edit")!;
  expect(attachmentEdit.getAttribute("aria-disabled")).not.toBe("true");
  await act(async () => userEvent.keyboard("{Escape}"));
  await expect.poll(() => document.querySelector('[role="menu"]')).toBeNull();
  await act(async () =>
    userEvent.click(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Remove reference.jpg"]'
      )!
    )
  );
  const goal = menuItem(await openAddMenu(container), "Goal");
  await act(async () => userEvent.click(goal));
  await editQueuedMessage(container);
  await act(async () => userEvent.fill(editor, "Discard this edit, too."));
  await act(async () => userEvent.keyboard("{Escape}"));
  await expect.poll(() => editor.textContent).toBe(draft);
  expect(queuedPreviews(container)[0].textContent).toBe(original);
  expect(
    container.querySelector('button[aria-label="Remove goal"]')
  ).not.toBeNull();
  expect(
    container.querySelector('button[aria-label="Remove plan"]')
  ).not.toBeNull();
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
  expect(container.querySelectorAll('[contenteditable="true"]')).toHaveLength(
    1
  );
  expect(container.textContent).not.toContain("Editing queued message");

  await act(async () =>
    userEvent.click(
      container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
    )
  );
  await expect.poll(() => queuedPreviews(container).length).toBe(4);
  expect(queuedPreviews(container)[3].textContent).toBe(`Goal: ${draft}`);
  const goalMenu = await openQueueActions(container, 3);
  const goalEdit = Array.from(
    goalMenu.querySelectorAll<HTMLElement>('[role="menuitem"]')
  ).find((item) => item.textContent?.trim() === "Edit")!;
  expect(goalEdit.getAttribute("aria-disabled")).toBe("true");
});

it("makes the mounted composer read-only during a pending queue save and retains a failed edit", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  let beginEdit: () => void;
  let finishSave: (saved: boolean) => void;
  const confirmation = new Promise<boolean>((resolve) => {
    finishSave = resolve;
  });
  const savedTexts: string[] = [];
  let normalSubmissions = 0;
  function InputFixture() {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    beginEdit = () => setEditing(true);
    return (
      <AgentComposerInput
        catalog={fixtures.catalog}
        autofocus={false}
        isStreaming={false}
        readOnly={saving}
        onSubmit={async (text) => {
          if (!editing) {
            normalSubmissions++;
            return;
          }
          savedTexts.push(text);
          setSaving(true);
          try {
            if (!(await confirmation)) throw new Error("Unconfirmed save");
            setEditing(false);
          } finally {
            setSaving(false);
          }
        }}
        onStop={() => {}}
        editing={
          editing
            ? {
                id: "deferred-queued-message",
                text: "The original queued text.",
                onCancel: () => setEditing(false),
              }
            : undefined
        }
      />
    );
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<InputFixture />));
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const draft = "Restore this normal draft after the edit is cancelled.";
  await act(async () => userEvent.fill(editor, draft));
  await act(async () => beginEdit!());
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
  expect(editor.textContent).toBe("The original queued text.");
  const replacement = "Keep this edited text if saving cannot be confirmed.";
  await act(async () => userEvent.fill(editor, replacement));
  const save = sendButton(container);
  await act(async () => userEvent.click(save));
  await expect.poll(() => editor.getAttribute("contenteditable")).toBe("false");
  expect(container.querySelector('[contenteditable="false"]')).toBe(editor);
  expect(save.disabled).toBe(true);
  expect(save.getAttribute("aria-label")).toBe("Sending…");
  expect(save.getAttribute("aria-busy")).toBe("true");
  expect(save.querySelector("svg.animate-spin")).not.toBeNull();
  expect(savedTexts).toEqual([replacement]);
  expect(normalSubmissions).toBe(0);

  await act(async () => finishSave!(false));
  await expect.poll(() => editor.getAttribute("contenteditable")).toBe("true");
  expect(editor.textContent).toBe(replacement);
  expect(save.disabled).toBe(false);
  expect(save.getAttribute("aria-busy")).toBe("false");
  expect(sendButton(container)).toBe(save);
  expect(container.textContent).toContain("Couldn't save changes.");
  await act(async () => {
    editor.focus();
    await userEvent.keyboard("{Escape}");
  });
  await expect.poll(() => editor.textContent).toBe(draft);
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
  expect(container.querySelectorAll('[contenteditable="true"]')).toHaveLength(
    1
  );
  expect(
    container.querySelector('button[aria-label="Cancel edit"]')
  ).toBeNull();
  expect(normalSubmissions).toBe(0);
});

it("edits and clears an image caption while retaining its queue icon, image and Plan settings", async () => {
  const container = await mountConversationDemo();
  await selectAddMenuAction(container, "Plan mode");
  await stageAttachment(container, "image");
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  await act(async () =>
    userEvent.fill(editor, "Use this image to plan the spacing.")
  );
  await act(async () =>
    userEvent.click(
      container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
    )
  );
  await expect.poll(() => queuedPreviews(container).length).toBe(4);
  await expect
    .poll(() => queuedPreviews(container)[3]?.textContent)
    .toBe("Plan · Use this image to plan the spacing.");
  await selectAddMenuAction(container, "Plan mode");
  await stageAttachment(container, "file");
  const ordinaryDraft = "Keep my notes linked to the design.";
  await act(async () => userEvent.fill(editor, ordinaryDraft));

  await editQueuedMessage(container, 3);
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
  expect(editor.textContent).toBe("Use this image to plan the spacing.");
  expect(
    container.querySelector('button[aria-label="Remove README.md"]')
  ).toBeNull();
  const caption = "Compare the image with the compact layout.";
  await act(async () => userEvent.fill(editor, caption));
  await act(async () => userEvent.click(sendButton(container)));
  await expect
    .poll(() => queuedPreviews(container)[3].textContent)
    .toBe(`Plan · ${caption}`);
  await expect.poll(() => editor.textContent).toBe(ordinaryDraft);
  expect(
    container.querySelector('button[aria-label="Remove README.md"]')
  ).not.toBeNull();
  expect(
    container.querySelector('button[aria-label="Remove plan"]')
  ).toBeNull();

  const preview = queuedPreviews(container)[3];
  await expect
    .poll(() => preview.querySelector('img[alt="reference.jpg"]'))
    .not.toBeNull();
  const indicator = preview.firstElementChild!;
  expect(indicator.tagName.toLowerCase()).toBe("svg");
  expect(
    indicator.compareDocumentPosition(
      preview.querySelector('img[alt="reference.jpg"]')!
    ) & Node.DOCUMENT_POSITION_FOLLOWING
  ).not.toBe(0);
  expect(
    queuedPreviews(container)[0].firstElementChild?.tagName.toLowerCase()
  ).toBe("svg");

  await editQueuedMessage(container, 3);
  await act(async () => userEvent.fill(editor, ""));
  await expect
    .poll(() => editor.querySelector('[data-placeholder="Ask anything…"]'))
    .not.toBeNull();
  expect(sendButton(container).disabled).toBe(false);
  await act(async () => userEvent.click(sendButton(container)));
  await expect
    .poll(() => queuedPreviews(container)[3].textContent)
    .toBe("Plan · reference.jpg");
  await expect
    .poll(() =>
      queuedPreviews(container)[3].querySelector('img[alt="reference.jpg"]')
    )
    .not.toBeNull();
  expect(
    queuedPreviews(container)[3].firstElementChild?.tagName.toLowerCase()
  ).toBe("svg");
  expect(editor.textContent).toBe(ordinaryDraft);
  expect(
    container.querySelector('button[aria-label="Remove README.md"]')
  ).not.toBeNull();
  const steer = (index: number) =>
    queuedSteer(queuedPreviews(container)[index]);
  expect(steer(0)?.disabled).toBe(false);
  await act(async () =>
    userEvent.click(
      container.querySelector('button[aria-label="Remove README.md"]')!
    )
  );
  expect(steer(0)?.disabled).toBe(false);
  expect(steer(1)?.disabled).toBe(false);
  expect(steer(3)).toBeUndefined();
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
});

it("edits and clears a file caption while keeping the file queued and steering disabled", async () => {
  const container = await mountConversationDemo();
  await stageAttachment(container, "file");
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  await act(async () => userEvent.fill(editor, "Review these attached notes."));
  await act(async () =>
    userEvent.click(
      container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
    )
  );
  await expect.poll(() => queuedPreviews(container).length).toBe(4);
  const ordinaryDraft =
    "Hold this ordinary draft while editing the file caption.";
  await act(async () => userEvent.fill(editor, ordinaryDraft));
  await editQueuedMessage(container, 3);
  await act(async () =>
    userEvent.fill(editor, "Start with the composer section.")
  );
  await act(async () => userEvent.click(sendButton(container)));
  await expect
    .poll(() => queuedPreviews(container)[3].textContent)
    .toBe("Start with the composer section.");
  expect(editor.textContent).toBe(ordinaryDraft);

  await editQueuedMessage(container, 3);
  await act(async () => userEvent.fill(editor, ""));
  await expect
    .poll(() => editor.querySelector('[data-placeholder="Ask anything…"]'))
    .not.toBeNull();
  expect(sendButton(container).disabled).toBe(false);
  await act(async () => userEvent.click(sendButton(container)));
  await expect
    .poll(() => queuedPreviews(container)[3].textContent)
    .toBe("README.md");
  const preview = queuedPreviews(container)[3];
  expect(preview.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  expect(queuedSteer(preview)).toBeUndefined();
  expect(editor.textContent).toBe(ordinaryDraft);
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
});

it("shows a pending send spinner, preserves newer edits and retains refused outgoing messages", async () => {
  const container = await mountConversationDemo();
  const hold = Array.from(container.querySelectorAll("label"))
    .find((label) => label.textContent?.includes("Hold submission"))!
    .querySelector<HTMLInputElement>("input")!;
  await act(async () => userEvent.click(hold));
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const original = "Wait for this send to be accepted.";
  await act(async () => userEvent.fill(editor, original));
  await act(async () =>
    userEvent.click(
      container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
    )
  );
  const sending = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Sending…"]'
  )!;
  expect(sending).not.toBeNull();
  expect(sending.disabled).toBe(true);
  expect(sending.getAttribute("aria-busy")).toBe("true");
  expect(sending.querySelector("svg.animate-spin")).not.toBeNull();
  expect(editor.textContent).toBe("");
  expect(queuedPreviews(container)[3].textContent).toBe(original);
  await act(async () => {
    editor.focus();
    await userEvent.keyboard("{Enter}");
  });
  expect(queuedPreviews(container)).toHaveLength(4);
  await act(async () => userEvent.fill(editor, ""));
  expect(container.querySelector('button[aria-label="Pause"]')).toBeNull();
  expect(container.querySelector('button[aria-label="Sending…"]')).toBe(
    sending
  );
  const newer = "A new draft typed while sending.";
  await act(async () => userEvent.fill(editor, newer));
  await expect
    .poll(() => textButton(container, "Accept submission"))
    .toBeDefined();
  await act(async () =>
    userEvent.click(textButton(container, "Accept submission"))
  );
  await expect
    .poll(() => container.querySelector('button[aria-label="Sending…"]'))
    .toBeNull();
  expect(queuedPreviews(container)[3].textContent).toBe(original);
  expect(editor.textContent).toBe(newer);
  expect(container.querySelector('button[aria-label="Sending…"]')).toBeNull();
  const refused = "Keep this request if acceptance fails.";
  await act(async () => userEvent.fill(editor, refused));
  await act(async () =>
    userEvent.click(
      container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
    )
  );
  expect(
    container.querySelector('button[aria-label="Sending…"]')
  ).not.toBeNull();
  await expect
    .poll(() => textButton(container, "Refuse submission"))
    .toBeDefined();
  await act(async () =>
    userEvent.click(textButton(container, "Refuse submission"))
  );
  await expect
    .poll(() => container.querySelector('button[aria-label="Sending…"]'))
    .toBeNull();
  expect(editor.textContent).toBe("");
  expect(queuedPreviews(container)).toHaveLength(5);
  const failed = queuedPreviews(container)[4];
  expect(failed.textContent).toBe(refused);
  expect(
    failed.parentElement?.querySelector('[role="status"]')?.textContent
  ).toBeTruthy();
});

it("does not show a prior chat's submission spinner or late refusal in a new scope", async () => {
  let reject!: (reason: Error) => void;
  const pending = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  const submitted: string[] = [];
  function ScopeFixture() {
    const [scope, setScope] = useState("first");
    return (
      <>
        <button onClick={() => setScope("second")}>Switch chat</button>
        <AgentComposerInput
          catalog={{ commands: [], mentions: [] }}
          submissionScope={scope}
          awaitSubmission
          isStreaming={false}
          onStop={() => {}}
          onSubmit={(text) => {
            submitted.push(text);
            return scope === "first" ? pending : Promise.resolve();
          }}
        />
      </>
    );
  }
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<ScopeFixture />));
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  await act(async () => userEvent.fill(editor, "First chat request"));
  await act(async () =>
    userEvent.click(
      container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
    )
  );
  expect(
    container.querySelector('button[aria-label="Sending…"]')
  ).not.toBeNull();
  await act(async () => userEvent.click(textButton(container, "Switch chat")));
  expect(container.querySelector('button[aria-label="Sending…"]')).toBeNull();
  await act(async () => userEvent.fill(editor, "Second chat request"));
  await act(async () =>
    userEvent.click(
      container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
    )
  );
  await expect.poll(() => editor.textContent).toBe("");
  await act(async () => reject(new Error("Late first-chat refusal")));
  expect(container.querySelector('button[aria-label="Sending…"]')).toBeNull();
  expect(container.textContent).not.toContain("Couldn't confirm the send");
  expect(submitted).toEqual(["First chat request", "Second chat request"]);
});

it("shows a host-owned first send across activation without needing a local submit lease", async () => {
  const submissions: string[] = [];
  function HostFixture() {
    const [submitting, setSubmitting] = useState(true);
    const [scope, setScope] = useState("activating");
    return (
      <>
        <button onClick={() => setScope("active")}>Activate chat</button>
        <button onClick={() => setSubmitting(false)}>Accept first send</button>
        <AgentComposerInput
          catalog={{ commands: [], mentions: [] }}
          submitting={submitting}
          submissionScope={scope}
          awaitSubmission
          isStreaming={false}
          busy={false}
          canSubmit
          onStop={() => {}}
          emptyAction={{
            label: "Pause",
            icon: <span>Pause</span>,
            onClick: () => {},
          }}
          onSubmit={(text) => {
            submissions.push(text);
          }}
        />
      </>
    );
  }
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<HostFixture />));
  const sending = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Sending…"]'
  )!;
  expect(sending.disabled).toBe(true);
  expect(sending.getAttribute("aria-busy")).toBe("true");
  expect(container.querySelector('button[aria-label="Pause"]')).toBeNull();
  await act(async () =>
    userEvent.click(textButton(container, "Activate chat"))
  );
  expect(container.querySelector('button[aria-label="Sending…"]')).toBe(
    sending
  );
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  await act(async () => {
    await userEvent.fill(editor, "Do not send twice");
    editor.focus();
    await userEvent.keyboard("{Enter}");
  });
  expect(submissions).toEqual([]);
  await act(async () =>
    userEvent.click(textButton(container, "Accept first send"))
  );
  expect(container.querySelector('button[aria-label="Sending…"]')).toBeNull();
  expect(
    container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
      .disabled
  ).toBe(false);
  expect(editor.textContent).toBe("Do not send twice");
});

it("accepts drops over the surrounding chat surface with the shared overlay and intake", async () => {
  const container = await mountConversationDemo({});
  const surface = container.querySelector<HTMLElement>(
    '[data-testid="workspace-native-chat"]'
  )!;
  const outsideInput = conversation(container);
  const editor = container.querySelector<HTMLElement>(
    "[data-composer-editor]"
  )!;
  await act(async () => userEvent.fill(editor, "Keep my draft."));
  const dispatch = (
    target: HTMLElement,
    type: string,
    dataTransfer: DataTransfer
  ) => {
    const event = new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };
  const data = new DataTransfer();
  data.items.add(
    new File(
      [await fixtures.readImage(fixtures.image.previewId!)],
      "reference.jpg",
      { type: "image/jpeg" }
    )
  );
  dispatch(outsideInput, "dragenter", data);
  const overlay = surface.querySelector<HTMLElement>(
    "[data-composer-drop-overlay]"
  );
  expect(overlay).not.toBeNull();
  expect(overlay?.textContent).toBe("Drop to attach");
  expect(dispatch(outsideInput, "drop", data).defaultPrevented).toBe(true);
  expect(surface.querySelector("[data-composer-drop-overlay]")).toBeNull();
  await expect
    .poll(
      () =>
        surface.querySelectorAll('button[aria-label="Remove reference.jpg"]')
          .length
    )
    .toBe(1);
  expect(editor.textContent).toBe("Keep my draft.");

  await act(async () => {
    surface
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Remove reference.jpg"]'
      )!
      .focus();
    await userEvent.keyboard("{Enter}");
  });
  const file = new DataTransfer();
  file.items.add(new File(["notes"], "README.md", { type: "text/markdown" }));
  dispatch(editor, "dragenter", file);
  expect(surface.querySelector("[data-composer-drop-overlay]")).not.toBeNull();
  dispatch(editor, "drop", file);
  await expect
    .poll(
      () =>
        surface.querySelectorAll('button[aria-label="Remove README.md"]').length
    )
    .toBe(1);
  expect(surface.querySelector("[data-composer-drop-overlay]")).toBeNull();
  expect(editor.textContent).toBe("Keep my draft.");

  dispatch(outsideInput, "dragenter", file);
  expect(surface.querySelector("[data-composer-drop-overlay]")).not.toBeNull();
  act(() => window.dispatchEvent(new Event("blur")));
  expect(surface.querySelector("[data-composer-drop-overlay]")).toBeNull();
  const text = new DataTransfer();
  text.setData("text/plain", "plain text");
  dispatch(outsideInput, "dragenter", text);
  expect(surface.querySelector("[data-composer-drop-overlay]")).toBeNull();
});
