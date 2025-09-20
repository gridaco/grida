"use client";

import { PropertySlider } from "./utils/slider-fat";

interface FontVariableAxisSliderProps {
  min: number;
  max: number;
  step: number;
  marks?: number[];
  defaultValue?: number;
  value?: number;
  onValueChange?: (value: number) => void;
  onValueCommit?: (value: number) => void;
  className?: string;
  snapThreshold?: number; // Customizable threshold (defaults to 5% of range)
  disabled?: boolean;
}

export function FontVariableAxisSlider(props: FontVariableAxisSliderProps) {
  return <PropertySlider {...props} />;
}
