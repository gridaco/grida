import { test, expect } from "@playwright/test";

test("canvas basic features", async ({ page }) => {
  // Navigate to canvas page
  await page.goto("/canvas");

  // wait for the page to load
  await page.waitForLoadState("load");
  // wait for extra 3 seconds
  await page.waitForTimeout(3000);

  // [r for rect]
  // Press 'r' to select rectangle tool
  await page.keyboard.press("r");

  // Get the viewport dimensions
  const viewportWidth = page.viewportSize()?.width || 0;
  const viewportHeight = page.viewportSize()?.height || 0;

  // Click in the center of the viewport to insert a rectangle
  await page.mouse.click(viewportWidth / 2, viewportHeight / 2);

  // Add a small wait to ensure the rectangle is rendered
  await page.waitForTimeout(100);

  // croll to right 100px
  await page.mouse.wheel(100, 0);

  // [o for circle]
  await page.keyboard.press("o");

  // Click in the center of the viewport to insert a circle
  await page.mouse.click(viewportWidth / 2, viewportHeight / 2);

  // Add a small wait to ensure the circle is rendered
  await page.waitForTimeout(100);

  // croll to right 100px
  await page.mouse.wheel(100, 0);

  // [l for line]
  await page.keyboard.press("l");

  // drag a-b
  await page.mouse.down();
  await page.mouse.move(viewportWidth / 2 + 100, viewportHeight / 2);
  await page.mouse.up();

  // Add a small wait to ensure the line is rendered
  await page.waitForTimeout(100);
});
