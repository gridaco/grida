import { expect, it } from "vitest";
import { formatResponseIndex } from "./response-index";

it("formats response indexes without truncating larger indexes", () => {
  expect([0, 1, 12, 123, 1234].map(formatResponseIndex)).toEqual([
    "#000",
    "#001",
    "#012",
    "#123",
    "#1234",
  ]);
});
