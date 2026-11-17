import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { NativeChatActivity } from "@grida/desktop-bridge";
import type { turn_activity } from "@/lib/agent-chat/turn-activity";
import { NativeTurnActivity } from "./native-turn-activity";
import "@/app/ui.css";

const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  ),
  (character) => character.charCodeAt(0)
);
const PATH = "/fixture/workspace/viewed.png";
const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function activity(
  outcome: NativeChatActivity["outcome"] = "succeeded"
): NativeChatActivity {
  return {
    callId: "viewed-image-call",
    title: "view_image",
    kind: "read",
    outcome,
    input: { path: PATH },
    output: {
      text:
        outcome === "succeeded"
          ? "Viewed prepared image"
          : "The source image could not be read.",
      truncated: false,
      images: [
        {
          previewId: "captured-image",
          mimeType: "image/png",
          size: PNG.byteLength,
        },
      ],
    },
  };
}

async function setup(
  call = activity(),
  loader?: (previewId: string) => Promise<Blob>,
  finished = false
) {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await page.viewport(860, 800);
  const container = document.createElement("section");
  container.className = "h-[760px] w-[820px] overflow-auto bg-background p-4";
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const block: Extract<turn_activity.Block, { kind: "turn" }> = {
    kind: "turn",
    turnId: "image-turn",
    requests: [],
    finished,
    outcome: finished ? "succeeded" : null,
    durationMs: finished ? 1_000 : null,
    work: [{ kind: "activity", key: "image-work", calls: [call] }],
    answers: [],
  };
  await act(async () =>
    root.render(
      <NativeTurnActivity
        block={block}
        renderMessage={() => null}
        loadToolImage={loader}
      />
    )
  );
  return { container, root };
}

async function imageIn(container: Element) {
  await expect
    .poll(() => container.querySelector<HTMLImageElement>("img")?.naturalWidth)
    .toBe(1);
  return container.querySelector<HTMLImageElement>("img")!;
}

describe("Retained viewed-image preview", () => {
  it("shows captured tool pixels inline and reuses their read for fullscreen, including a reopened completed turn", async () => {
    const blob = new Blob([PNG], { type: "image/png" });
    const loader = vi.fn<(previewId: string) => Promise<Blob>>(
      async () => blob
    );
    const fetch = vi.spyOn(globalThis, "fetch");
    const first = await setup(activity(), loader);
    const inline = await imageIn(first.container);
    expect(await (await globalThis.fetch(inline.src)).arrayBuffer()).toEqual(
      PNG.buffer
    );
    expect(loader).toHaveBeenCalledExactlyOnceWith("captured-image");
    // The retained fixture is one pixel. Keyboard activation exercises the
    // fullscreen interaction without inventing a larger pointer target.
    await act(async () => {
      inline.closest<HTMLButtonElement>("button")!.focus();
      await userEvent.keyboard("{Enter}");
    });
    const dialog = page.getByRole("dialog", {
      name: `Preview ${PATH}`,
      exact: true,
    });
    await expect.element(dialog).toBeVisible();
    await expect
      .poll(
        () =>
          document.querySelector<HTMLImageElement>(
            '[data-testid="dialog-image-preview"] img'
          )?.naturalWidth
      )
      .toBe(1);
    await expect
      .element(
        dialog.getByRole("button", { name: "Download image", exact: true })
      )
      .toBeEnabled();
    expect(loader).toHaveBeenCalledTimes(1);
    await act(async () =>
      dialog.getByRole("button", { name: "Close", exact: true }).click()
    );
    await expect.element(dialog).not.toBeInTheDocument();
    act(() => first.root.unmount());
    roots.splice(roots.indexOf(first.root), 1);
    first.container.remove();

    const replayed = structuredClone(activity());
    const reopened = await setup(replayed, loader, true);
    expect(reopened.container.querySelector("img")).toBeNull();
    await act(async () =>
      page.getByRole("button", { name: /Worked for/ }).click()
    );
    const restored = await imageIn(reopened.container);
    expect(await (await globalThis.fetch(restored.src)).arrayBuffer()).toEqual(
      PNG.buffer
    );
    expect(loader.mock.calls).toEqual([["captured-image"], ["captured-image"]]);
    expect(fetch.mock.calls.some(([url]) => String(url).includes(PATH))).toBe(
      false
    );
  });

  it("shows an unavailable state when captured bytes cannot be read", async () => {
    const loader = vi.fn<(previewId: string) => Promise<Blob>>(async () => {
      throw new Error("native_chat_tool_image_unavailable");
    });
    const f = await setup(activity(), loader);
    await act(async () => {
      await expect.poll(() => loader.mock.calls.length).toBe(1);
    });
    await expect
      .element(page.getByRole("button", { name: /Preview unavailable/ }))
      .toBeVisible();
    expect(f.container.querySelector("img")).toBeNull();
    expect(loader).toHaveBeenCalledExactlyOnceWith("captured-image");
  });

  it("keeps missing capability results visible without trying the original path", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const f = await setup(activity());
    await expect
      .element(page.getByText("Preview unavailable", { exact: true }))
      .toBeVisible();
    expect(f.container.textContent).toContain(PATH);
    expect(f.container.querySelector("img")).toBeNull();
    expect(fetch.mock.calls.some(([url]) => String(url).includes(PATH))).toBe(
      false
    );
  });

  it("shows the failure text and never retrieves pixels for a failed tool call", async () => {
    const loader = vi.fn<(previewId: string) => Promise<Blob>>();
    const f = await setup(activity("failed"), loader);
    await expect
      .element(
        page.getByText("The source image could not be read.", { exact: true })
      )
      .toBeVisible();
    expect(f.container.querySelector("img")).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });
});
