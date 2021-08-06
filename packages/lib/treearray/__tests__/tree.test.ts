import { __insert } from "../index";
test("", () => {
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
  console.log(test);

  expect("").toBe(""); // dummy
});
