export * from "./frame";

/**
 * factors ussed when optimizing root level frames in canvas. when displaying in full-scale
 * e.g. when zoom < 0.1, then we rather show an static image then showing it as a vanilla html iframe.
 */
export interface FrameOptimizationFactors {
  /**
   * zoom of the canvas
   */
  zoom: number;
  /**
   * whether the frame is in user visible area
   */
  inViewport: boolean;
  /**
   * whether the frame is selected / focused by user
   */
  focused: boolean;

  /**
   * whether the canvas is being zoomed by user
   */
  isZooming: boolean;

  /**
   * whether the canvas is being panned by user
   */
  isPanning: boolean;
}
