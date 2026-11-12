import { test } from "node:test";
import assert from "node:assert/strict";
import { subtotal, total, receipt } from "../src/cart.js";

const items = [
  { name: "mug", price: 1200, quantity: 1 },
  { name: "sticker", price: 400, quantity: 2 },
];

test("subtotal adds price times quantity", () => {
  assert.equal(subtotal(items), 2000);
});

test("no code keeps the subtotal", () => {
  assert.equal(total(items), 2000);
});

test("SAVE10 takes ten percent off", () => {
  assert.equal(total(items, "SAVE10"), 1800);
});

test("HALF takes half off", () => {
  assert.equal(total(items, "HALF"), 1000);
});

test("receipt counts items and formats the total", () => {
  assert.equal(receipt(items, "SAVE10"), "3 items, $18.00");
});
