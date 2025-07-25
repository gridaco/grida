/**
 * @deprecated This hook is deprecated. Only use it from demo page for now.
 * Use the new GradientControlPointsEditor with plain React props instead.
 */

import { useGradient, type UseGradientOptions, type UseGradientReturn } from "./use-gradient";

export interface UseGradientControlPointsOptions extends UseGradientOptions {}

export interface UseGradientControlPointsReturn extends UseGradientReturn {}

/**
 * @deprecated This hook is deprecated. Only use it from demo page for now.
 * Use the new GradientControlPointsEditor with plain React props instead.
 * 
 * This hook wraps the old useGradient functionality for backward compatibility.
 */
export function useGradientControlPoints(
  options: UseGradientControlPointsOptions
): UseGradientControlPointsReturn {
  console.warn(
    "useGradientControlPoints is deprecated. Only use it from demo page for now. " +
    "Use the new GradientControlPointsEditor with plain React props instead."
  );
  
  return useGradient(options);
}