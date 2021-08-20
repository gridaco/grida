import { __insert } from "../index";
test("insert on last", () => {
  const test = __insert({
    step: {
      big: 1000,
    },
    insert: { id: "new" },
    insertat: 10,
    data: [
      { id: "0", sort: 1 }, // 2
      { id: "1", sort: 2 }, // 3
      { id: "2", sort: 3 }, // 4
      { id: "3", sort: 1000 }, // 1000
      { id: "4", sort: 1001 }, // 1001
      { id: "5", sort: 1002 }, // 1002
      { id: "6", sort: 3000 }, // 3000
    ],
  });

  expect(test).toEqual({
    data: [
      { id: "0", sort: 1 },
      { id: "1", sort: 2 },
      { id: "2", sort: 3 },
      { id: "3", sort: 1000 },
      { id: "4", sort: 1001 },
      { id: "5", sort: 1002 },
      { id: "6", sort: 3000 },
      { id: "new", sort: 4000 },
    ],
    insert: { id: "new", sort: 4000 },
    shifted: [],
  });
});

test("insert on first", () => {
  const test = __insert({
    step: {
      big: 1000,
    },
    insert: { id: "new" },
    insertat: 0,
    data: [
      { id: "0", sort: 1 }, // 2
      { id: "1", sort: 2 }, // 3
      { id: "2", sort: 3 }, // 4
      { id: "3", sort: 1000 }, // 1000
      { id: "4", sort: 1001 }, // 1001
      { id: "5", sort: 1002 }, // 1002
      { id: "6", sort: 3000 }, // 3000
    ],
  });

  expect(test).toEqual({
    data: [
      { id: "new", sort: 1 },
      { id: "0", sort: 2 },
      { id: "1", sort: 3 },
      { id: "2", sort: 4 },
      { id: "3", sort: 1000 },
      { id: "4", sort: 1001 },
      { id: "5", sort: 1002 },
      { id: "6", sort: 3000 },
    ],
    insert: { id: "new", sort: 1 },
    shifted: [
      {
        id: "0",
        sort: 2,
      },
      {
        id: "1",
        sort: 3,
      },
      {
        id: "2",
        sort: 4,
      },
    ],
  });
});
