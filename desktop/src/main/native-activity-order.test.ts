// GRIDA-SEC-004 — unsupported or malformed metadata cannot manufacture chronology.
import { expect, it } from "vitest";
import { NativeActivityOrder } from "./native-activity-order";

it("preserves positive safe integer positions and explicit missing facts", () => {
  expect(NativeActivityOrder.read({ activityOrder: 1 }, true, true)).toEqual({
    activityOrder: 1,
  });
  expect(
    NativeActivityOrder.read(
      { activityOrder: Number.MAX_SAFE_INTEGER },
      true,
      true
    )
  ).toEqual({ activityOrder: Number.MAX_SAFE_INTEGER });
  expect(
    NativeActivityOrder.read({ activityOrderIncomplete: true }, true, true)
  ).toEqual({ activityOrderIncomplete: true });
  expect(NativeActivityOrder.read({}, true)).toEqual({});
});

it.each([
  0,
  -1,
  1.5,
  Number.MAX_SAFE_INTEGER + 1,
  NaN,
  Infinity,
  null,
  "1",
  {},
  true,
])("refuses an invalid coordinate (%s)", (activityOrder) =>
  expect(() => NativeActivityOrder.read({ activityOrder }, true)).toThrow(
    "native_chat_activity_order_invalid"
  )
);

it.each([
  {},
  { activityOrderIncomplete: false },
  { activityOrderIncomplete: null },
  { activityOrder: 1, activityOrderIncomplete: true },
])(
  "requires one unambiguous fact under the negotiated contract (%j)",
  (fact) => {
    expect(() => NativeActivityOrder.read(fact, true, true)).toThrow(
      "native_chat_activity_order_invalid"
    );
  }
);

it("withholds unsolicited coordinates from unsupported hosts", () => {
  expect(NativeActivityOrder.read({ activityOrder: 7 }, false, true)).toEqual(
    {}
  );
  expect(
    NativeActivityOrder.read(
      { activityOrder: "future-version", activityOrderIncomplete: false },
      false,
      true
    )
  ).toEqual({});
});

it("fills missing evidence monotonically and refuses only a changed known position", () => {
  expect(
    NativeActivityOrder.merge({ activityOrder: 2 }, { activityOrder: 2 })
  ).toEqual({ activityOrder: 2 });
  expect(NativeActivityOrder.merge({ activityOrder: 2 }, {})).toEqual({
    activityOrder: 2,
  });
  expect(
    NativeActivityOrder.merge(
      { activityOrder: 2 },
      { activityOrderIncomplete: true }
    )
  ).toEqual({ activityOrder: 2 });
  expect(
    NativeActivityOrder.merge(
      { activityOrderIncomplete: true },
      { activityOrder: 3 }
    )
  ).toEqual({ activityOrder: 3 });
  expect(
    NativeActivityOrder.merge(
      { activityOrderIncomplete: true },
      { activityOrderIncomplete: true }
    )
  ).toEqual({ activityOrderIncomplete: true });
  expect(() =>
    NativeActivityOrder.merge({ activityOrder: 2 }, { activityOrder: 3 })
  ).toThrow("native_chat_activity_order_invalid");
});

it("preserves uniform metadata when stream/window attribution is absent and checks both when supplied", () => {
  const metadata = {
    [NativeActivityOrder.capability]: { turnId: "turn", activityOrder: 3 },
  };
  expect(
    NativeActivityOrder.notification(metadata, undefined, true, true)
  ).toEqual({ turnId: "turn", activityOrder: 3 });
  expect(
    NativeActivityOrder.notification(
      metadata,
      { turnId: "turn", activityOrder: 3 },
      true,
      true
    )
  ).toEqual({ turnId: "turn", activityOrder: 3 });
  expect(() =>
    NativeActivityOrder.notification(
      metadata,
      { turnId: "foreign", activityOrder: 3 },
      true,
      true
    )
  ).toThrow("native_chat_activity_order_invalid");
  expect(() =>
    NativeActivityOrder.notification(
      metadata,
      { turnId: "turn", activityOrder: 4 },
      true,
      true
    )
  ).toThrow("native_chat_activity_order_invalid");
  expect(() =>
    NativeActivityOrder.notification(
      metadata,
      { turnId: "turn", activityOrderIncomplete: true },
      true,
      true
    )
  ).toThrow("native_chat_activity_order_invalid");
  expect(
    NativeActivityOrder.notification(metadata, undefined, false, true)
  ).toEqual({});
});
