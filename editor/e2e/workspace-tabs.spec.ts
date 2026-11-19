import { expect, test } from "@playwright/test";

test("dragging to the edge of the workspace tab strip reaches a finite end", async ({
  isMobile,
  page,
}) => {
  test.skip(isMobile, "Exercises mouse-driven tab sorting");
  await page.goto("/ui/components/workspace-tabs");
  const narrow = page.getByRole("button", { name: "Narrow window" });
  await narrow.click();
  await expect(narrow).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => document.fonts.ready);

  const workspace = page.getByRole("group", { name: "Mixed workspace tabs" });
  const rail = workspace.getByRole("tablist", { name: "Open editors" });
  const tab = rail.getByRole("tab", { name: "Art direction.md" });
  const { scrollWidth, clientWidth } = await rail.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);

  const source = (await tab.boundingBox())!;
  const viewport = (await rail.boundingBox())!;
  const y = source.y + source.height / 2;
  await page.mouse.move(source.x + source.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(viewport.x + viewport.width - 5, y, { steps: 12 });
  await expect
    .poll(() => rail.evaluate((element) => element.scrollLeft))
    .toBe(scrollWidth - clientWidth);
  expect(await rail.evaluate((element) => element.scrollWidth)).toBe(
    scrollWidth
  );
  await page.mouse.up();

  await expect(rail.getByRole("tab").last()).toContainText("Art direction.md");
  await expect(tab).toHaveAttribute("aria-selected", "true");
});

test("chat examples use the workspace tab preview without changing selection", async ({
  isMobile,
  page,
}) => {
  test.skip(isMobile, "Exercises pointer hover previews");
  await page.goto("/ui/components/workspace-tabs");

  const chats = page.getByRole("region", { name: "Chat tab previews" });
  const current = chats.getByRole("tab", { name: "Current chat" });
  const waiting = chats.getByRole("tab", { name: "Waiting for reply" });
  const image = chats.getByRole("tab", { name: "Image reference" });
  const empty = chats.getByRole("tab", { name: "New chat" });
  const preview = page.getByTestId("chat-tab-preview");

  await current.hover();
  await expect(preview).toContainText("Refine this composer.");
  await expect(preview).toContainText("Open + or type / for commands.");
  await waiting.hover();
  await expect(preview).toContainText("Please check the spacing");
  await expect(preview.locator('[aria-label="Grida"]')).toHaveCount(0);
  await image.hover();
  await expect(preview).toContainText("reference.jpg");
  await empty.hover();
  await expect(preview).toContainText("No messages yet");
  await expect(current).toHaveAttribute("aria-selected", "true");

  await image.press("Enter");
  await expect(image).toHaveAttribute("aria-selected", "true");
  await image
    .getByRole("button", { name: "Close Image reference" })
    .press("Enter");
  await expect(image).toHaveCount(0);
  await page.getByRole("button", { name: "Reset tabs" }).click();
  await expect(current).toHaveAttribute("aria-selected", "true");
  await expect(image).toBeVisible();
});
