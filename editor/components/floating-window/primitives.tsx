"use client";

import React, {
  CSSProperties,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useDrag } from "@use-gesture/react";

export type BoundsRenderProps = {
  boundaryRef: React.RefObject<HTMLDivElement | null>;
};

export type FloatingWindowBoundsProps = {
  className?: string;
  style?: CSSProperties;
  children: React.ReactNode | ((props: BoundsRenderProps) => React.ReactNode);
};

export function FloatingWindowPortal({
  children,
  container,
}: {
  children: React.ReactNode;
  container?: HTMLElement | null;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const target =
    mounted && typeof document !== "undefined"
      ? (container ?? document.body)
      : null;
  if (!target) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[9999]">
      {children}
    </div>,
    target
  );
}

export function FloatingWindowBounds({
  className,
  style,
  children,
}: FloatingWindowBoundsProps) {
  const boundaryRef = useRef<HTMLDivElement | null>(null);

  const rendered =
    typeof children === "function"
      ? (children as (props: BoundsRenderProps) => React.ReactNode)({
          boundaryRef,
        })
      : children;

  return (
    <div
      ref={boundaryRef}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        ...style,
      }}
    >
      {rendered}
    </div>
  );
}

export type DragHandleProps = ReturnType<ReturnType<typeof useDrag>>;

export type FloatingWindowRenderProps = {
  dragHandleProps: DragHandleProps;
  windowRef: React.RefObject<HTMLDivElement | null>;
  controls: FloatingWindowControls;
};

type ElementSize = {
  width: number;
  height: number;
};

export type FloatingWindowRegistry = {
  register: (id: string, controls: FloatingWindowControls) => void;
  unregister: (id: string, controls: FloatingWindowControls) => void;
  get: (id: string) => FloatingWindowControls | undefined;
};

const FloatingWindowRegistryContext =
  createContext<FloatingWindowRegistry | null>(null);

export function FloatingWindowHost({ children }: React.PropsWithChildren<{}>) {
  const storeRef = useRef(new Map<string, FloatingWindowControls>());

  const registry = useMemo<FloatingWindowRegistry>(() => {
    return {
      register: (id, controls) => {
        storeRef.current.set(id, controls);
      },
      unregister: (id, controls) => {
        const current = storeRef.current.get(id);
        if (current === controls) {
          storeRef.current.delete(id);
        }
      },
      get: (id) => storeRef.current.get(id),
    };
  }, []);

  return (
    <FloatingWindowRegistryContext.Provider value={registry}>
      {children}
    </FloatingWindowRegistryContext.Provider>
  );
}

export type FloatingWindowRootProps = {
  windowId: string;
  boundaryRef: React.RefObject<HTMLDivElement | null>;
  initialX?: number;
  initialY?: number;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
  transition?: string;
  onMove?: (pos: { x: number; y: number }) => void;
  disabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  controls?: FloatingWindowControls;
  portal?: boolean;
  portalContainer?: HTMLElement | null;
  render?: (helpers: FloatingWindowRenderProps) => React.ReactNode;
  children?:
    | React.ReactNode
    | ((helpers: FloatingWindowRenderProps) => React.ReactNode);
};

export function FloatingWindowRoot({
  windowId,
  boundaryRef,
  initialX = 0,
  initialY = 0,
  width,
  height,
  render,
  children,
  className,
  style,
  transition = "transform 160ms ease",
  onMove,
  disabled,
  open,
  defaultOpen = true,
  onOpenChange,
  controls: providedControls,
  portal = true,
  portalContainer,
}: FloatingWindowRootProps) {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const registry = useContext(FloatingWindowRegistryContext);
  const localControls = useFloatingWindowControls({
    open,
    defaultOpen,
    onOpenChange,
  });
  const controls = providedControls ?? localControls;
  const boundarySize = useElementSize(boundaryRef);
  const boundaryRect = useElementRect(boundaryRef);
  const windowSize = useElementSize(windowRef);
  const [dragging, setDragging] = useState(false);
  const positionRef = useRef<{ x: number; y: number }>({
    x: initialX,
    y: initialY,
  });
  const frame = useRef<number | null>(null);
  const [suppressTransition, setSuppressTransition] = useState(false);
  const suppressFrame = useRef<number | null>(null);

  const applyPosition = (pos: { x: number; y: number }) => {
    const el = windowRef.current;
    if (!el) return;
    const offsetX = boundaryRect?.left ?? 0;
    const offsetY = boundaryRect?.top ?? 0;
    el.style.setProperty("--floating-window-x", `${pos.x + offsetX}px`);
    el.style.setProperty("--floating-window-y", `${pos.y + offsetY}px`);
  };

  useLayoutEffect(() => {
    applyPosition(positionRef.current);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!registry) return;
    registry.register(windowId, controls);
    return () => registry.unregister(windowId, controls);
  }, [registry, windowId, controls]);

  useLayoutEffect(() => {
    if (controls.open) {
      const next = { x: initialX, y: initialY };
      const clamped = clampToBoundary(next.x, next.y);
      positionRef.current = clamped;
      applyPosition(clamped);
      setDragging(false);
      setSuppressTransition(true);
      if (suppressFrame.current !== null) {
        cancelAnimationFrame(suppressFrame.current);
      }
      suppressFrame.current = requestAnimationFrame(() => {
        suppressFrame.current = null;
        setSuppressTransition(false);
      });
    } else {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls.open, initialX, initialY]);

  useLayoutEffect(() => {
    if (!controls.open) return;
    const clamped = clampToBoundary(
      positionRef.current.x,
      positionRef.current.y
    );
    positionRef.current = clamped;
    applyPosition(clamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    boundarySize?.width,
    boundarySize?.height,
    windowSize?.width,
    windowSize?.height,
  ]);

  const clampToBoundary = (x: number, y: number) => {
    // If boundary metrics aren't ready yet, allow movement freely.
    if (!boundarySize || !windowSize) {
      return { x, y };
    }

    const boundaryW = boundarySize.width;
    const boundaryH = boundarySize.height;
    const windowW = windowSize.width;
    const windowH = windowSize.height;
    const maxX = Math.max(0, boundaryW - windowW);
    const maxY = Math.max(0, boundaryH - windowH);
    return {
      x: Math.min(Math.max(0, x), maxX),
      y: Math.min(Math.max(0, y), maxY),
    };
  };

  const scheduleMove = (next: { x: number; y: number }) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      positionRef.current = next;
      applyPosition(next);
      onMove?.(next);
    });
  };

  const dragBindings = useDrag(
    ({ offset: [mx, my], first, last }) => {
      if (first) setDragging(true);
      const clamped = clampToBoundary(mx, my);
      scheduleMove(clamped);
      if (last) setDragging(false);
    },
    {
      from: () => [positionRef.current.x, positionRef.current.y],
      enabled: !disabled,
      preventScroll: true,
      pointer: { capture: true },
    }
  );

  const renderContent = useMemo(() => {
    const helpers = {
      dragHandleProps: dragBindings({}),
      windowRef,
      controls,
    };

    if (render) {
      return render(helpers);
    }

    if (typeof children === "function") {
      return (children as (h: FloatingWindowRenderProps) => React.ReactNode)(
        helpers
      );
    }

    return children;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render, children, dragBindings]);

  if (!controls.open) {
    return null;
  }

  const content = (
    <div
      ref={windowRef}
      data-floating-window
      className={className}
      style={{
        ["--floating-window-x" as any]: `${positionRef.current.x}px`,
        ["--floating-window-y" as any]: `${positionRef.current.y}px`,
        width,
        height,
        position: "absolute",
        transform:
          "translate3d(var(--floating-window-x, 0px), var(--floating-window-y, 0px), 0)",
        transition:
          dragging || suppressTransition ? undefined : transition || undefined,
        willChange: "transform",
        ...style,
      }}
    >
      {renderContent}
    </div>
  );

  if (!portal) {
    return content;
  }

  return (
    <FloatingWindowPortal container={portalContainer}>
      {content}
    </FloatingWindowPortal>
  );
}

export type TitleBarProps = React.HTMLAttributes<HTMLDivElement> & {
  dragHandleProps?: DragHandleProps;
};

export function FloatingWindowTitleBar({
  className,
  dragHandleProps,
  children,
  ...rest
}: TitleBarProps) {
  return (
    <div
      {...dragHandleProps}
      {...rest}
      data-floating-window-titlebar
      className={className}
    >
      {children}
    </div>
  );
}

export type FloatingWindowControlsConfig = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export type FloatingWindowControls = {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
  openWindow: () => void;
  closeWindow: () => void;
};

export function useFloatingWindowControls(
  config: FloatingWindowControlsConfig = {}
): FloatingWindowControls {
  const { open, defaultOpen = true, onOpenChange } = config;
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const isControlled = typeof open === "boolean";
  const state = isControlled ? open : uncontrolled;

  const setOpen = (next: boolean) => {
    if (!isControlled) {
      setUncontrolled(next);
    }
    onOpenChange?.(next);
  };

  return {
    open: state,
    setOpen,
    toggle: () => setOpen(!state),
    openWindow: () => setOpen(true),
    closeWindow: () => setOpen(false),
  };
}

export type TriggerProps = {
  controls?: FloatingWindowControls;
  windowId: string;
  asChild?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function FloatingWindowTrigger({
  controls,
  windowId,
  asChild,
  children,
  onClick,
  ...rest
}: TriggerProps) {
  const registry = useContext(FloatingWindowRegistryContext);
  const getControls = () => controls || registry?.get(windowId) || undefined;

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    onClick?.(e);
    if (!e.defaultPrevented) {
      const resolved = getControls();
      resolved?.openWindow();
    }
  };

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<any>;
    return React.cloneElement(child, {
      onClick: (e: any) => {
        child.props?.onClick?.(e);
        handleClick(e);
      },
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-disabled={!getControls()}
      {...rest}
    >
      {children}
    </button>
  );
}

export type CloseProps = {
  controls?: FloatingWindowControls;
  windowId: string;
  asChild?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function FloatingWindowClose({
  controls,
  windowId,
  asChild,
  children,
  onClick,
  ...rest
}: CloseProps) {
  const registry = useContext(FloatingWindowRegistryContext);
  const getControls = () => controls || registry?.get(windowId) || undefined;

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    onClick?.(e);
    if (!e.defaultPrevented) {
      const resolved = getControls();
      resolved?.closeWindow();
    }
  };

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<any>;
    return React.cloneElement(child, {
      onClick: (e: any) => {
        child.props?.onClick?.(e);
        handleClick(e);
      },
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-disabled={!getControls()}
      {...rest}
    >
      {children}
    </button>
  );
}

export function FloatingWindowBody({
  className,
  children,
  style,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      data-floating-window-body
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}

function useElementSize(
  ref: React.RefObject<HTMLElement | null>
): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function useElementRect(
  ref: React.RefObject<HTMLElement | null>
): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const next = el.getBoundingClientRect();
      setRect(next);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);

    const onScrollOrResize = () => update();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [ref]);

  return rect;
}
