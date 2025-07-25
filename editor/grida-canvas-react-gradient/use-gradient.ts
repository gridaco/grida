import { useReducer, useCallback, useRef, useEffect } from "react";
import {
  gradientReducer,
  createInitialState,
  type GradientState,
  type GradientType,
  type GradientValue,
  type GradientTransform,
  getControlPoints,
  getStopMarkerTransform,
} from "./gradient-reducer";
import type cg from "@grida/cg";

export interface UseGradientOptions {
  gradientType: GradientType;
  initialValue?: GradientValue;
  width?: number;
  height?: number;
  readonly?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export interface UseGradientReturn {
  // State
  state: GradientState;
  readonly: boolean;

  // Transform and positioning
  transform: GradientTransform;
  controlPoints: ReturnType<typeof getControlPoints>;

  // Stops management
  stops: cg.GradientStop[];
  focusedStop: number | null;
  focusedControl: "A" | "B" | "C" | null;

  // Actions
  dispatch: React.Dispatch<any>;

  // Transform actions
  setTransform: (transform: GradientTransform) => void;
  updateControlPoint: (
    point: "A" | "B" | "C",
    deltaX: number,
    deltaY: number
  ) => void;

  // Stop actions
  setStops: (stops: cg.GradientStop[]) => void;
  addStop: (stop: cg.GradientStop) => void;
  updateStop: (index: number, updates: Partial<cg.GradientStop>) => void;
  removeStop: (index: number) => void;
  updateStopColor: (index: number, color: cg.RGBA8888) => void;
  updateStopOffset: (index: number, offset: number) => void;

  // Focus actions
  setFocusedStop: (index: number | null) => void;
  setFocusedControl: (control: "A" | "B" | "C" | null) => void;
  resetFocus: () => void;

  // Pointer event handlers
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.MouseEvent | PointerEvent) => void;
  handlePointerUp: (e?: React.MouseEvent | PointerEvent) => void;
  handlePointerLeave: (e?: React.MouseEvent) => void;

  // Utility functions
  getStopMarkerTransform: (
    position: number
  ) => ReturnType<typeof getStopMarkerTransform>;
  getValue: () => GradientValue;

  // Container ref for positioning
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useGradient({
  gradientType,
  initialValue,
  width = 400,
  height = 300,
  readonly = false,
  preventDefault = true,
  stopPropagation = true,
}: UseGradientOptions): UseGradientReturn {
  const [state, dispatch] = useReducer(gradientReducer, {
    ...createInitialState(gradientType, initialValue),
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate control points
  const controlPoints = getControlPoints(state.controlPoints, width, height);

  // Transform actions
  const setTransform = useCallback((transform: GradientTransform) => {
    dispatch({
      type: "SET_TRANSFORM",
      payload: { transform, gradientType },
    });
  }, []);

  const updateControlPoint = useCallback(
    (point: "A" | "B" | "C", deltaX: number, deltaY: number) => {
      dispatch({
        type: "UPDATE_CONTROL_POINT",
        payload: { point, deltaX, deltaY, width, height, gradientType },
      });
    },
    [width, height, gradientType]
  );

  // Stop actions
  const setStops = useCallback((stops: cg.GradientStop[]) => {
    dispatch({ type: "SET_STOPS", payload: stops });
  }, []);

  const addStop = useCallback((stop: cg.GradientStop) => {
    dispatch({ type: "ADD_STOP", payload: stop });
  }, []);

  const updateStop = useCallback(
    (index: number, updates: Partial<cg.GradientStop>) => {
      dispatch({ type: "UPDATE_STOP", payload: { index, updates } });
    },
    []
  );

  const removeStop = useCallback((index: number) => {
    dispatch({ type: "REMOVE_STOP", payload: index });
  }, []);

  const updateStopColor = useCallback(
    (index: number, color: cg.RGBA8888) => {
      updateStop(index, { color });
    },
    [updateStop]
  );

  const updateStopOffset = useCallback(
    (index: number, offset: number) => {
      updateStop(index, { offset });
    },
    [updateStop]
  );

  // Focus actions
  const setFocusedStop = useCallback((index: number | null) => {
    dispatch({ type: "SET_FOCUSED_STOP", payload: index });
  }, []);

  const setFocusedControl = useCallback((control: "A" | "B" | "C" | null) => {
    dispatch({ type: "SET_FOCUSED_CONTROL", payload: control });
  }, []);

  const resetFocus = useCallback(() => {
    dispatch({ type: "RESET_FOCUS" });
  }, []);

  // Pointer event handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (preventDefault) e.preventDefault();
      if (stopPropagation) e.stopPropagation();
      if (readonly || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      dispatch({
        type: "HANDLE_POINTER_DOWN",
        payload: { x, y, width, height, gradientType },
      });
    },
    [readonly, preventDefault, stopPropagation, width, height, gradientType]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | PointerEvent) => {
      if (preventDefault) e.preventDefault();
      if (stopPropagation) e.stopPropagation();
      if (readonly || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      dispatch({
        type: "HANDLE_POINTER_MOVE",
        payload: { x, y, width, height, gradientType },
      });
    },
    [readonly, preventDefault, stopPropagation, width, height, gradientType]
  );

  const handlePointerUp = useCallback(
    (e?: React.MouseEvent | PointerEvent) => {
      if (preventDefault) e?.preventDefault();
      if (stopPropagation) e?.stopPropagation();
      if (readonly) return;
      dispatch({ type: "HANDLE_POINTER_UP" });
    },
    [readonly, preventDefault, stopPropagation]
  );

  const handlePointerLeave = useCallback(
    (e?: React.MouseEvent) => {
      if (preventDefault) e?.preventDefault();
      if (stopPropagation) e?.stopPropagation();
      if (readonly) return;
      dispatch({ type: "HANDLE_POINTER_LEAVE" });
    },
    [readonly, preventDefault, stopPropagation]
  );

  // Utility functions
  const getStopMarkerTransformUtil = useCallback(
    (position: number) => {
      return getStopMarkerTransform(
        position,
        gradientType,
        state.controlPoints,
        width,
        height
      );
    },
    [gradientType, state.controlPoints, width, height]
  );

  const getValue = useCallback((): GradientValue => {
    const _t = state.transform;
    return {
      stops: state.stops,
      transform: [
        [_t.a, _t.b, _t.tx],
        [_t.d, _t.e, _t.ty],
      ],
    };
  }, [state.stops, state.transform]);

  // Register global pointer events for dragging outside bounds
  useEffect(() => {
    if (readonly) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (state.dragState.type) {
        handlePointerMove(e);
      }
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (state.dragState.type) {
        handlePointerUp(e);
      }
    };

    if (state.dragState.type) {
      window.addEventListener("pointermove", handleGlobalPointerMove, {
        passive: false,
      });
      window.addEventListener("pointerup", handleGlobalPointerUp, {
        passive: false,
      });
    }

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, [state.dragState.type, readonly, handlePointerMove, handlePointerUp]);

  return {
    // State
    state,
    readonly,

    // Transform and positioning
    transform: state.transform,
    controlPoints,

    // Stops management
    stops: state.stops,
    focusedStop: state.focusedStop,
    focusedControl: state.focusedControl,

    // Actions
    dispatch,

    // Transform actions
    setTransform,
    updateControlPoint,

    // Stop actions
    setStops,
    addStop,
    updateStop,
    removeStop,
    updateStopColor,
    updateStopOffset,

    // Focus actions
    setFocusedStop,
    setFocusedControl,
    resetFocus,

    // Pointer event handlers
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,

    // Utility functions
    getStopMarkerTransform: getStopMarkerTransformUtil,
    getValue,

    // Container ref
    containerRef,
  };
}
