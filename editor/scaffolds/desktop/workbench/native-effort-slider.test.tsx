import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Slider as SliderPrimitive } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import { NativeEffortSlider } from "./native-effort-slider";

type RootProps = ComponentProps<typeof SliderPrimitive.Root>;
const captured = vi.hoisted(() => ({
  root: undefined as RootProps | undefined,
}));

vi.mock("radix-ui", () => {
  const Container = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Slider: {
      Root: (props: RootProps) => {
        captured.root = props;
        return <>{props.children}</>;
      },
      Track: Container,
      Thumb: () => <span role="slider" />,
    },
  };
});

function fixture() {
  const choose = vi.fn<(value: number) => void>();
  renderToStaticMarkup(
    <NativeEffortSlider
      labels={["Low", "Medium", "High", "Extra high", "Ultra"]}
      value={1}
      onValueChange={choose}
    />
  );
  const focus = vi.fn<(options?: FocusOptions) => void>();
  const thumb = {
    contains: (target: unknown) => target === thumb,
    getBoundingClientRect: () => ({ width: 28 }),
    focus,
  };
  const pointer = (clientX: number, onThumb = false) => ({
    button: 0,
    clientX,
    target: onThumb ? thumb : {},
    currentTarget: {
      querySelector: () => thumb,
      getBoundingClientRect: () => ({ left: 100, width: 228 }),
    },
    preventDefault: vi.fn<() => void>(),
  });
  const press = (event: ReturnType<typeof pointer>) =>
    captured.root!.onPointerDown!(
      event as unknown as Parameters<NonNullable<RootProps["onPointerDown"]>>[0]
    );
  return { choose, focus, pointer, press };
}

describe("effort slider gestures", () => {
  it.each([
    [100, 0],
    [260, 3],
    [328, 4],
  ])(
    "track press at %s immediately selects step %s without starting Radix dragging",
    (x, step) => {
      const { choose, focus, pointer, press } = fixture();
      const event = pointer(x);
      press(event);
      expect(choose).toHaveBeenCalledExactlyOnceWith(step);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    }
  );

  it("knob dragging updates effort at the nearest step before release", () => {
    const { choose, pointer, press } = fixture();
    const event = pointer(164, true);
    press(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    captured.root!.onValueChange!([2.4]);
    expect(choose).toHaveBeenCalledExactlyOnceWith(2);
    captured.root!.onValueCommit!([2.4]);
    expect(choose).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("motion within the selected effort step does not change the selected value", () => {
    const { choose } = fixture();
    captured.root!.onValueChange!([1.3]);
    expect(choose).not.toHaveBeenCalled();
    captured.root!.onValueChange!([1.6]);
    expect(choose).toHaveBeenCalledExactlyOnceWith(2);
  });

  it.each([
    ["ArrowRight", 2],
    ["ArrowLeft", 0],
    ["Home", 0],
    ["End", 4],
  ])("keyboard %s selects a whole step (%s)", (key, step) => {
    const { choose } = fixture();
    const preventDefault = vi.fn<() => void>();
    captured.root!.onKeyDown!({
      key,
      preventDefault,
    } as unknown as Parameters<NonNullable<RootProps["onKeyDown"]>>[0]);
    expect(choose).toHaveBeenCalledExactlyOnceWith(step);
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
