import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { DesktopComposerDemo } from "./desktop-demo";
import { DesktopComposerFixtures as fixtures } from "./desktop-fixtures";
import { DesktopQueueFixture } from "./desktop-queue-fixture";
import { AgentComposerInput } from "@/scaffolds/desktop/shared/agent-composer-input";

const roots: Root[] = [];
async function mountConversationDemo(): Promise<HTMLDivElement> {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<DesktopComposerDemo />));
  return container;
}

async function selectConversation(container: HTMLElement, value: string) {
  const select = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Conversation example"]'
  )!;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function conversation(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>(
    '[data-testid="desktop-conversation-preview"]'
  )!;
}

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
  const menu = await openQueueActions(container, index);
  const edit = Array.from(
    menu.querySelectorAll<HTMLElement>('[role="menuitem"]')
  ).find((item) => item.textContent?.trim() === "Edit")!;
  expect(edit.getAttribute("aria-disabled")).not.toBe("true");
  await act(async () => {
    edit.focus();
    await userEvent.keyboard("{Enter}");
  });
  await expect
    .poll(() => container.textContent)
    .toContain("Editing queued message");
}

function exampleTab(container: HTMLElement, title: string): HTMLElement {
  const demo = container.querySelector<HTMLElement>(
    '[data-testid="desktop-chat-tabs-demo"]'
  )!;
  return Array.from(demo.querySelectorAll<HTMLElement>('[role="tab"]')).find(
    (tab) => tab.querySelector(`button[aria-label="Close ${title}"]`) !== null
  )!;
}

async function hoverExampleTab(
  container: HTMLElement,
  title: string
): Promise<HTMLElement> {
  await act(async () => userEvent.hover(exampleTab(container, title)));
  await expect
    .poll(
      () =>
        document.querySelector('[data-testid="chat-tab-preview"]')?.textContent
    )
    .toContain(title);
  return document.querySelector<HTMLElement>(
    '[data-testid="chat-tab-preview"]'
  )!;
}

async function focusExampleTab(
  container: HTMLElement,
  title: string
): Promise<HTMLElement> {
  await act(async () => exampleTab(container, title).focus());
  await expect
    .poll(
      () =>
        document.querySelector('[data-testid="chat-tab-preview"]')?.textContent
    )
    .toContain(title);
  return document.querySelector<HTMLElement>(
    '[data-testid="chat-tab-preview"]'
  )!;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
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
  const container = await mountConversationDemo();
  await act(async () => userEvent.click(runningTurn(container)));
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
  const container = await mountConversationDemo();
  await act(async () => userEvent.click(runningTurn(container)));
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
  const container = await mountConversationDemo();
  await act(async () => userEvent.click(runningTurn(container)));
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
  expect(form.querySelector('[role="alert"]')?.textContent).toContain(
    "Fixture submission refused"
  );
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
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<DesktopComposerDemo />);
  });
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
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<DesktopComposerDemo />);
  });
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
  const image = menuItem(panel!, "Image");
  await act(async () => {
    image.click();
  });
  expect(container.querySelector("[data-composer-action-menu]")).toBeNull();
  expect(container.textContent).toContain("reference.jpg");
});

it("reorders the production queue with its keyboard handle and resets the examples", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<DesktopComposerDemo />);
  });
  const queue = container.querySelector<HTMLElement>(
    '[data-testid="native-composer-queue"]'
  )!;
  const previews = () =>
    Array.from(
      queue.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Preview queued message"]'
      )
    );
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
    (button) => button.textContent === "Reset examples"
  )!;
  await act(async () => reset.click());
  expect(previews()[0].textContent).toContain("Check the composer");
  expect(previews()).toHaveLength(3);
});

it("demonstrates production Steer controls for a running turn and resets their local result", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<DesktopComposerDemo />));
  const queue = container.querySelector<HTMLElement>(
    '[data-testid="native-composer-queue"]'
  )!;
  const steeringButtons = () =>
    Array.from(queue.querySelectorAll<HTMLButtonElement>("button")).filter(
      (button) => button.textContent?.trim() === "Steer"
    );
  const previews = () =>
    queue.querySelectorAll('button[aria-label="Preview queued message"]');
  const running = Array.from(container.querySelectorAll("label"))
    .find((label) => label.textContent?.includes("Running turn"))!
    .querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(running.checked).toBe(true);
  expect(steeringButtons()).toHaveLength(3);
  expect(steeringButtons().map((button) => button.disabled)).toEqual([
    false,
    true,
    true,
  ]);
  await act(async () => steeringButtons()[0].click());
  await expect.poll(() => previews().length).toBe(2);
  await expect
    .poll(
      () =>
        container.querySelector('[aria-label="Steering preview"]')?.textContent
    )
    .toContain(fixtures.queue[0].text);
  expect(container.querySelector('[contenteditable="true"]')?.textContent).toBe(
    ""
  );

  await act(async () => running.click());
  expect(running.checked).toBe(false);
  expect(steeringButtons()).toHaveLength(0);
  const reset = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Reset examples"
  )!;
  await act(async () => reset.click());
  expect(running.checked).toBe(true);
  expect(previews()).toHaveLength(3);
  expect(steeringButtons().map((button) => button.disabled)).toEqual([
    false,
    true,
    true,
  ]);
  expect(
    container.querySelector('[aria-label="Steering preview"]')?.textContent ??
      ""
  ).not.toContain(fixtures.queue[0].text);
});

it("renders production Markdown, recorded work, streaming and empty conversation states", async () => {
  const container = await mountConversationDemo();
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

  await selectConversation(container, "activity");
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

  await selectConversation(container, "streaming");
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
    .find((label) => label.textContent?.includes("Running turn"))!
    .querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => running.click());
  expect(
    Array.from(assistant.querySelectorAll("button")).some(
      (button) => button.textContent?.trim() === "Copy"
    )
  ).toBe(true);

  await selectConversation(container, "empty");
  expect(conversation(container).textContent).toContain("No messages yet");
  expect(
    conversation(container).querySelector('[aria-label="Message text"]')
  ).toBeNull();
  expect(
    conversation(container).querySelector('[aria-label="Message attachments"]')
  ).toBeNull();
});

it("shows the live SVG selection for eligible sends and keeps the sent indicator after deselection", async () => {
  const container = await mountConversationDemo();
  await selectConversation(container, "svg-selection");
  const surface = container.querySelector<HTMLElement>(
    '[data-testid="desktop-composer-surface"]'
  )!;
  const transcript = conversation(container);
  const countIndicators = (root: HTMLElement) =>
    root.textContent?.match(/SVG text selection/g)?.length ?? 0;
  expect(countIndicators(surface)).toBe(2);
  expect(countIndicators(transcript)).toBe(1);

  await selectAddMenuAction(container, "Plan mode");
  expect(countIndicators(surface)).toBe(1);
  await selectAddMenuAction(container, "Plan mode");
  expect(countIndicators(surface)).toBe(2);

  const composer = surface.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const selection = Array.from(container.querySelectorAll("label"))
    .find((label) => label.textContent?.trim() === "SVG text selected")!
    .querySelector("input")!;
  const send = async (text: string) =>
    act(async () => {
      await userEvent.fill(composer, text);
      await userEvent.click(
        surface.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
      );
    });
  await send("Read this selection.");
  await expect.poll(() => countIndicators(transcript)).toBe(2);
  await act(async () => userEvent.click(selection));
  expect(countIndicators(surface)).toBe(2);

  await send("This message has no selection.");
  await expect
    .poll(() => transcript.textContent)
    .toContain("This message has no selection.");
  expect(countIndicators(transcript)).toBe(2);
  expect(
    transcript.querySelector('[aria-label="Message attachments"]')
  ).toBeNull();
});

it("uses production attachment cards, retained-image loading and fullscreen inspection", async () => {
  const container = await mountConversationDemo();
  await selectConversation(container, "attachments");
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
  const container = await mountConversationDemo();
  await selectConversation(container, "empty");
  const running = Array.from(container.querySelectorAll("label"))
    .find((label) => label.textContent?.includes("Running turn"))!
    .querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => running.click());
  expect(running.checked).toBe(false);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Add to message"]')!
      .click()
  );
  const panel = container.querySelector<HTMLElement>(
    "[data-composer-action-menu]"
  )!;
  const image = menuItem(panel, "Image");
  await act(async () => image.click());
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

it("keeps the shared placeholder across modes and attachments while preserving restrictions and Default access", async () => {
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

  const image = menuItem(await openAddMenu(container), "Image");
  await act(async () => image.click());
  await expect.poll(placeholder).toBe("Ask anything…");
  const blockedGoal = menuItem(await openAddMenu(container), "Goal");
  expect(blockedGoal.getAttribute("aria-disabled")).toBe("true");
  await act(async () => blockedGoal.click());
  expect(
    container.querySelector('button[aria-label="Remove goal"]')
  ).toBeNull();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Add to message"]')!
      .click()
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Remove reference.jpg"]'
      )!
      .click()
  );

  const access = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Access: Default"]'
  )!;
  expect(access.querySelector("svg")).not.toBeNull();
  await act(async () => userEvent.click(access));
  await expect
    .poll(() => document.querySelector('[role="dialog"]')?.textContent)
    .toContain("Access for new messages");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Reads and edits this project's files and runs sandboxed commands. Commands cannot use the internet."
  );
  await act(async () => userEvent.keyboard("{Escape}"));
  await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
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
  const previews = () =>
    container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="native-composer-queue"] button[aria-label="Preview queued message"]'
    );
  await expect.poll(() => previews().length).toBe(4);
  const preview = previews()[3];
  expect(preview.textContent).toBe(`Plan · ${text}`);
  const steer = Array.from(
    preview.parentElement!.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => button.textContent?.trim() === "Steer")!;
  expect(steer.disabled).toBe(true);
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
  await editQueuedMessage(container);
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
  const save = textButton(container, "Save changes");
  expect(save.disabled).toBe(false);
  await act(async () => userEvent.click(save));
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
  const image = menuItem(await openAddMenu(container), "Image");
  await act(async () => userEvent.click(image));
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
  ).toBeNull();
  await act(async () => userEvent.fill(editor, "/plan"));
  expect(container.querySelector("[data-composer-trigger-menu]")).toBeNull();
  const replacement = "Replace only the queued text.";
  await act(async () => userEvent.fill(editor, replacement));
  await act(async () => userEvent.click(textButton(container, "Save changes")));
  await expect
    .poll(() => queuedPreviews(container)[0].textContent)
    .toBe(replacement);
  const preview = queuedPreviews(container)[0];
  expect(preview.querySelector("img")).toBeNull();
  const steer = Array.from(
    preview.parentElement!.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => button.textContent?.trim() === "Steer")!;
  expect(steer.disabled).toBe(false);
  expect(editor.textContent).toBe(draft);
  expect(
    container.querySelector('button[aria-label="Remove reference.jpg"]')
  ).not.toBeNull();
  expect(
    container.querySelector('button[aria-label="Remove plan"]')
  ).not.toBeNull();
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
});

it("cancels queue edits with Cancel or Escape while restoring ordinary intent and attachment context", async () => {
  const container = await mountConversationDemo();
  const plan = menuItem(await openAddMenu(container), "Plan mode");
  await act(async () => userEvent.click(plan));
  const image = menuItem(await openAddMenu(container), "Image");
  await act(async () => userEvent.click(image));
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const draft = "This ordinary draft must survive either cancellation.";
  await act(async () => userEvent.fill(editor, draft));
  const original = queuedPreviews(container)[0].textContent;
  await editQueuedMessage(container);
  await act(async () => userEvent.fill(editor, "Discard this queued edit."));
  await act(async () => userEvent.click(textButton(container, "Cancel")));
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
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Remove reference.jpg"]'
      )!
      .focus();
    await userEvent.keyboard("{Enter}");
  });
  const goal = menuItem(await openAddMenu(container), "Goal");
  await act(async () => userEvent.click(goal));
  await editQueuedMessage(container);
  await act(async () => userEvent.fill(editor, "Escape discards this edit."));
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
    beginEdit = () => setEditing(true);
    return (
      <AgentComposerInput
        catalog={fixtures.catalog}
        autofocus={false}
        isStreaming={false}
        onSubmit={() => {
          normalSubmissions++;
        }}
        onStop={() => {}}
        editing={
          editing
            ? {
                id: "deferred-queued-message",
                text: "The original queued text.",
                label: "Editing queued message",
                onSave: (text) => {
                  savedTexts.push(text);
                  return confirmation;
                },
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
  const save = textButton(container, "Save changes");
  const cancel = textButton(container, "Cancel");
  await act(async () => userEvent.click(save));
  await expect.poll(() => editor.getAttribute("contenteditable")).toBe("false");
  expect(container.querySelector('[contenteditable="false"]')).toBe(editor);
  expect(save.disabled).toBe(true);
  expect(cancel.disabled).toBe(true);
  expect(save.getAttribute("aria-busy")).toBe("true");
  expect(save.querySelector("svg.animate-spin")).not.toBeNull();
  expect(savedTexts).toEqual([replacement]);
  expect(normalSubmissions).toBe(0);

  await act(async () => finishSave!(false));
  await expect.poll(() => editor.getAttribute("contenteditable")).toBe("true");
  expect(editor.textContent).toBe(replacement);
  expect(save.disabled).toBe(false);
  expect(save.getAttribute("aria-busy")).toBe("false");
  expect(cancel.disabled).toBe(false);
  expect(container.textContent).toContain("Editing queued message");
  await act(async () => userEvent.click(cancel));
  await expect.poll(() => editor.textContent).toBe(draft);
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
  expect(container.querySelectorAll('[contenteditable="true"]')).toHaveLength(
    1
  );
  expect(container.textContent).not.toContain("Editing queued message");
  expect(normalSubmissions).toBe(0);
});

it("selects the example chat tabs with pointer or keyboard and closes and resets them", async () => {
  const container = await mountConversationDemo();
  const demo = container.querySelector<HTMLElement>(
    '[data-testid="desktop-chat-tabs-demo"]'
  )!;
  const tablist = demo.querySelector<HTMLElement>(
    '[role="tablist"][aria-label="Example chat tabs"]'
  )!;
  expect(tablist).not.toBeNull();
  expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(4);
  expect(
    exampleTab(container, "Current chat").getAttribute("aria-selected")
  ).toBe("true");
  await act(async () =>
    userEvent.click(exampleTab(container, "Image reference"))
  );
  expect(
    exampleTab(container, "Image reference").getAttribute("aria-selected")
  ).toBe("true");
  expect(
    exampleTab(container, "Current chat").getAttribute("aria-selected")
  ).toBe("false");

  const waiting = exampleTab(container, "Waiting for reply");
  await act(async () => {
    waiting.focus();
    await userEvent.keyboard("{Enter}");
  });
  expect(waiting.getAttribute("aria-selected")).toBe("true");
  expect(
    exampleTab(container, "Image reference").getAttribute("aria-selected")
  ).toBe("false");
  await act(async () => {
    demo
      .querySelector<HTMLButtonElement>('button[aria-label="Close New chat"]')!
      .focus();
    await userEvent.keyboard("{Enter}");
  });
  expect(demo.querySelector('button[aria-label="Close New chat"]')).toBeNull();
  expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(3);
  expect(waiting.getAttribute("aria-selected")).toBe("true");
  await act(async () =>
    userEvent.click(
      demo.querySelector<HTMLButtonElement>(
        'button[aria-label="Close Image reference"]'
      )!
    )
  );
  expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(2);
  expect(waiting.getAttribute("aria-selected")).toBe("true");
  await act(async () => userEvent.click(textButton(demo, "Reset tabs")));
  expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(4);
  expect(
    demo.querySelector('button[aria-label="Close New chat"]')
  ).not.toBeNull();
  expect(
    tablist.querySelectorAll('[role="tab"][aria-selected="true"]')
  ).toHaveLength(1);
});

it("previews shared user and assistant excerpts without selecting a tab and follows live chat messages", async () => {
  const container = await mountConversationDemo();
  const current = exampleTab(container, "Current chat");
  const preview = await focusExampleTab(container, "Current chat");
  const userExcerpt = preview.querySelector(
    '[role="group"][aria-label="You"]'
  )!;
  const assistantExcerpt = preview.querySelector(
    '[role="group"][aria-label="Grida"]'
  )!;
  expect(userExcerpt).not.toBeNull();
  expect(assistantExcerpt).not.toBeNull();
  expect(userExcerpt.textContent).toBe(
    "Refine this composer. Keep the draft when a menu closes, and make queued messages easy to inspect."
  );
  const assistantText = assistantExcerpt.textContent!;
  expect(assistantText.startsWith("Composer review ")).toBe(true);
  expect(assistantText).toContain("Open + or type / for commands.");
  expect(assistantText).toContain(
    "Use Steer to submit without interrupting the model."
  );
  expect(assistantText).toContain(
    'const message = { text: "Keep the draft" };'
  );
  expect(assistantText).not.toMatch(
    /(^|\s)#{1,6}\s|\*\*|`|(?:^|\s)-\s|\[[^\]]+\]\([^)]+\)/
  );
  const visibleParagraphs = Array.from(preview.querySelectorAll("p")).map(
    (paragraph) => paragraph.textContent
  );
  expect(visibleParagraphs).not.toContain("You");
  expect(visibleParagraphs).not.toContain("Grida");
  const waitingPreview = await focusExampleTab(container, "Waiting for reply");
  expect(
    waitingPreview.querySelector('[role="group"][aria-label="You"]')
      ?.textContent
  ).toContain("Please check the spacing between the model picker and Send.");
  expect(
    waitingPreview.querySelector('[role="group"][aria-label="Grida"]')
  ).toBeNull();
  expect(current.getAttribute("aria-selected")).toBe("true");
  expect(
    exampleTab(container, "Waiting for reply").getAttribute("aria-selected")
  ).toBe("false");

  const imagePreview = await focusExampleTab(container, "Image reference");
  expect(
    imagePreview.querySelector('[role="group"][aria-label="You"]')?.textContent
  ).toContain("reference.jpg");
  expect(
    imagePreview.querySelector('[role="group"][aria-label="Grida"]')
      ?.textContent
  ).toContain(
    "I’ll use the attached image to compare spacing, alignment, and rounded corners."
  );
  expect(current.getAttribute("aria-selected")).toBe("true");

  const emptyPreview = await focusExampleTab(container, "New chat");
  expect(emptyPreview.textContent).toContain("No messages yet");
  expect(emptyPreview.querySelector('[role="group"]')).toBeNull();
  expect(current.getAttribute("aria-selected")).toBe("true");

  await selectConversation(container, "empty");
  await act(async () => runningTurn(container).click());
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  const text = "A newly sent message is available in the current tab preview.";
  const markdown = `**${text}** Read [composer details](https://example.test/composer).`;
  await act(async () => userEvent.fill(editor, markdown));
  await act(async () =>
    userEvent.click(
      container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
    )
  );
  const livePreview = await hoverExampleTab(container, "Current chat");
  expect(
    livePreview.querySelector('[role="group"][aria-label="You"]')?.textContent
  ).toBe(`${text} Read composer details.`);
  expect(
    livePreview.querySelector('[role="group"][aria-label="Grida"]')
  ).toBeNull();
  expect(current.getAttribute("aria-selected")).toBe("true");
});

it("edits and clears an image caption while retaining its queue icon, image and Plan settings", async () => {
  const saves = vi.spyOn(DesktopQueueFixture.prototype, "saveQueueDraft");
  const edits = vi.spyOn(DesktopQueueFixture.prototype, "editQueue");
  const container = await mountConversationDemo();
  await selectAddMenuAction(container, "Plan mode");
  await selectAddMenuAction(container, "Image");
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
  expect(queuedPreviews(container)[3].textContent).toBe(
    "Plan · Use this image to plan the spacing."
  );
  await selectAddMenuAction(container, "Plan mode");
  await selectAddMenuAction(container, "Files");
  await act(async () =>
    userEvent.fill(editor, "Keep my notes linked to @read")
  );
  await expect
    .poll(() => container.querySelector("[data-composer-trigger-menu]"))
    .not.toBeNull();
  await act(async () =>
    userEvent.click(
      menuItem(
        container.querySelector<HTMLElement>("[data-composer-trigger-menu]")!,
        "README.md"
      )
    )
  );
  const ordinaryDraft = editor.textContent;
  expect(
    editor.querySelector('[data-composer-mention="readme"]')?.textContent
  ).toBe("@README.md");

  await editQueuedMessage(container, 3);
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
  expect(editor.textContent).toBe("Use this image to plan the spacing.");
  expect(
    container.querySelector('button[aria-label="Remove README.md"]')
  ).toBeNull();
  const caption = "Compare the image with the compact layout.";
  await act(async () => userEvent.fill(editor, caption));
  await act(async () => userEvent.click(textButton(container, "Save changes")));
  await expect
    .poll(() => queuedPreviews(container)[3].textContent)
    .toBe(`Plan · ${caption}`);
  await expect.poll(() => editor.textContent).toBe(ordinaryDraft);
  expect(
    editor
      .querySelector('[data-composer-mention="readme"]')
      ?.getAttribute("path")
  ).toBe("README.md");
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
  expect(textButton(container, "Save changes").disabled).toBe(false);
  await act(async () => userEvent.click(textButton(container, "Save changes")));
  expect(saves.mock.calls).toEqual([[caption], [""]]);
  expect(edits.mock.calls.at(-1)?.[0]).toMatchObject({
    action: "replaceText",
    text: "",
  });
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
    editor.querySelector('[data-composer-mention="readme"]')?.textContent
  ).toBe("@README.md");
  expect(
    container.querySelector('button[aria-label="Remove README.md"]')
  ).not.toBeNull();
  const steer = (index: number) =>
    Array.from(
      queuedPreviews(container)[
        index
      ].parentElement!.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent?.trim() === "Steer")!;
  expect(steer(0).disabled).toBe(false);
  expect(steer(1).disabled).toBe(true);
  expect(steer(3).disabled).toBe(true);
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
});

it("edits and clears a file caption while keeping the file queued and steering disabled", async () => {
  const container = await mountConversationDemo();
  await selectAddMenuAction(container, "Files");
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
  await act(async () => userEvent.click(textButton(container, "Save changes")));
  await expect
    .poll(() => queuedPreviews(container)[3].textContent)
    .toBe("Start with the composer section.");
  expect(editor.textContent).toBe(ordinaryDraft);
  expect(
    queuedPreviews(container)[3].querySelector('[aria-label="File attachment"]')
  ).not.toBeNull();

  await editQueuedMessage(container, 3);
  await act(async () => userEvent.fill(editor, ""));
  await expect
    .poll(() => editor.querySelector('[data-placeholder="Ask anything…"]'))
    .not.toBeNull();
  expect(textButton(container, "Save changes").disabled).toBe(false);
  await act(async () => userEvent.click(textButton(container, "Save changes")));
  await expect
    .poll(() => queuedPreviews(container)[3].textContent)
    .toBe("README.md");
  const preview = queuedPreviews(container)[3];
  expect(preview.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  expect(
    preview.querySelector('[aria-label="File attachment"]')
  ).not.toBeNull();
  const steer = Array.from(
    preview.parentElement!.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => button.textContent?.trim() === "Steer")!;
  expect(steer.disabled).toBe(true);
  expect(editor.textContent).toBe(ordinaryDraft);
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
});

it("uses the same Home composer controls and retains text, attachment, modes and effort across surfaces", async () => {
  const container = await mountConversationDemo();
  const surface = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Composer surface"]'
  )!;
  await act(async () => {
    surface.value = "home";
    surface.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(
    container.querySelector('[data-testid="native-composer-queue"]')
  ).toBeNull();
  expect(
    container
      .querySelector('[data-testid="desktop-composer-surface"]')!
      .querySelector('[data-testid="desktop-conversation-preview"]')
  ).toBeNull();
  expect(runningTurn(container).disabled).toBe(true);
  const editor = container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  await act(async () =>
    userEvent.fill(editor, "Keep my Home draft and reference.")
  );
  await selectAddMenuAction(container, "Plan mode");
  await selectAddMenuAction(container, "Image");
  expect(
    container.querySelector('button[aria-label="Remove plan"]')
  ).not.toBeNull();
  expect(
    container.querySelector('button[aria-label="Remove reference.jpg"]')
  ).not.toBeNull();
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Add to message"]')!
      .focus();
    await userEvent.keyboard("{Enter}");
  });
  expect(
    menuItem(
      container.querySelector("[data-composer-action-menu]")!,
      "Goal"
    ).getAttribute("aria-disabled")
  ).toBe("true");
  await act(async () => userEvent.keyboard("{Escape}"));
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>(
        '[role="combobox"][aria-label="Model connection"]'
      )!
      .focus();
    await userEvent.keyboard("{Enter}");
  });
  await expect
    .poll(() => document.querySelector('[role="slider"]'))
    .not.toBeNull();
  await act(async () => {
    (document.querySelector('[role="slider"]') as HTMLElement).focus();
    await userEvent.keyboard("{ArrowRight}");
  });
  await expect
    .poll(() =>
      document.querySelector('[role="slider"]')?.getAttribute("aria-valuenow")
    )
    .toBe("3");
  await act(async () => userEvent.keyboard("{Escape}"));
  expect(editor.textContent).toBe("Keep my Home draft and reference.");
  await act(async () => {
    surface.value = "workspace";
    surface.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
  expect(editor.textContent).toBe("Keep my Home draft and reference.");
  expect(
    container.querySelector('button[aria-label="Remove plan"]')
  ).not.toBeNull();
  expect(
    container.querySelector('button[aria-label="Remove reference.jpg"]')
  ).not.toBeNull();
  expect(
    container.querySelector('[role="combobox"][aria-label="Model connection"]')
      ?.textContent
  ).toContain("Extra high");
});

it("shows a pending send spinner through empty-draft controls, preserves newer edits and retains refused drafts", async () => {
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
  expect(editor.textContent).toBe(original);
  await act(async () => {
    editor.focus();
    await userEvent.keyboard("{Enter}");
  });
  expect(queuedPreviews(container)).toHaveLength(3);
  await act(async () => userEvent.fill(editor, ""));
  expect(container.querySelector('button[aria-label="Pause"]')).toBeNull();
  expect(container.querySelector('button[aria-label="Sending…"]')).toBe(
    sending
  );
  const newer = "A new draft typed while sending.";
  await act(async () => userEvent.fill(editor, newer));
  await act(async () =>
    userEvent.click(textButton(container, "Accept submission"))
  );
  await expect.poll(() => queuedPreviews(container).length).toBe(4);
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
  await act(async () =>
    userEvent.click(textButton(container, "Refuse submission"))
  );
  await expect
    .poll(() => container.querySelector('button[aria-label="Sending…"]'))
    .toBeNull();
  expect(editor.textContent).toBe(refused);
  expect(queuedPreviews(container)).toHaveLength(4);
  expect(
    container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!
      .disabled
  ).toBe(false);
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

it("accepts Home drops over the surrounding surface with the shared overlay and intake", async () => {
  const container = await mountConversationDemo();
  const select = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Composer surface"]'
  )!;
  await act(async () => {
    select.value = "home";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const surface = container.querySelector<HTMLElement>(
    '[data-testid="desktop-composer-surface"]'
  )!;
  const outsideInput = surface.querySelector<HTMLElement>("h2")!;
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
  data.items.add(new File(["image"], "drop.png", { type: "image/png" }));
  dispatch(outsideInput, "dragenter", data);
  const overlay = surface.querySelector<HTMLElement>(
    "[data-composer-drop-overlay]"
  );
  expect(overlay).not.toBeNull();
  expect(overlay?.textContent).toBe("Drop to attach");
  expect(dispatch(outsideInput, "drop", data).defaultPrevented).toBe(true);
  expect(surface.querySelector("[data-composer-drop-overlay]")).toBeNull();
  expect(
    surface.querySelectorAll('button[aria-label="Remove reference.jpg"]')
  ).toHaveLength(1);
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
  file.items.add(new File(["notes"], "notes.txt", { type: "text/plain" }));
  dispatch(editor, "dragenter", file);
  expect(surface.querySelector("[data-composer-drop-overlay]")).not.toBeNull();
  dispatch(editor, "drop", file);
  expect(
    surface.querySelectorAll('button[aria-label="Remove README.md"]')
  ).toHaveLength(1);
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
