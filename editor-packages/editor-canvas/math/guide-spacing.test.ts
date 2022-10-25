import { spacing_guide } from "./guide-spacing";

// tests
//  - a = [10, 10, 20, 20], b = [20, 20, 30, 30], then the spacing is [10, 0, 0, 10] and the base box is [20, 20, 20, 20]
//  - a = [10, 10, 20, 20], b = [15, 15, 25, 25], then the spacing is [5, 5, 5, 5] and the base box is [15, 15, 20, 20]
//  - a = [450, 450, 550, 550], b = [0, 0, 1000, 1000], then the spacing is [450, 450, 450, 450] and the base box is [450, 450, 550, 550]
//  - a = [0, 0, 1000, 1000], b = [450, 450, 550, 550], then the spacing is [450, 450, 450, 450] and the base box is [450, 450, 550, 550]
//  - a = [0, 0, 50, 50], b = [0, 0, 20, 20], then the spacing is [0, 30, 30, 0] and the base box is [0, 0, 20, 20]
//  - a = [10, 10, 20, 20], b = [30, 30, 40, 40], then the spacing is [20, 10, 10, 20] and the base box is [10, 10, 20, 20]

test("spacing guide (not intersecting)", () => {
  expect(spacing_guide([10, 10, 20, 20], [20, 20, 30, 30])).toStrictEqual({
    box: [20, 20, 20, 20],
    spacing: [10, 10, 10, 10],
  });
});

test("spacing guide (intersecting)", () => {
  expect(spacing_guide([10, 10, 20, 20], [15, 15, 25, 25])).toStrictEqual({
    box: [15, 15, 20, 20],
    spacing: [5, 5, 5, 5],
  });
});

test("spacing guide (b contains a)", () => {
  expect(spacing_guide([450, 450, 550, 550], [0, 0, 1000, 1000])).toStrictEqual(
    {
      box: [450, 450, 550, 550],
      spacing: [450, 450, 450, 450],
    }
  );
});

test("spacing guide (a contains b)", () => {
  expect(spacing_guide([0, 0, 1000, 1000], [450, 450, 550, 550])).toStrictEqual(
    {
      box: [450, 450, 550, 550],
      spacing: [450, 450, 450, 450],
    }
  );
});

test("spacing guide (a contains b)", () => {
  expect(spacing_guide([0, 0, 50, 50], [0, 0, 20, 20])).toStrictEqual({
    box: [0, 0, 20, 20],
    spacing: [0, 30, 30, 0],
  });
});

test("spacing guide (not intersecting)", () => {
  expect(spacing_guide([10, 10, 20, 20], [30, 30, 40, 40])).toStrictEqual({
    box: [10, 10, 20, 20],
    spacing: [20, 10, 10, 20],
  });
});
