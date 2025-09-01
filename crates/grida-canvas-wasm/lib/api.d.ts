///
/// working draft, API design for Grida Canvas WASM interface.
/// `@grida/canvas-wasm`
/// all NOT_IMPLEMENTED unless marked `@version 1`
///

type TODO = unknown;

// export default function init(
//   opts?: GridaCanvasModuleInitOptions
// ): Promise<Grida2DScene>;

/**
 * Vector2: [x, y]
 */
export type Vector2 = [number, number];

/**
 * Transform2D: [[a, b, c], [d, e, f]]
 */
export type Transform2D = [[number, number, number], [number, number, number]];

/**
 * Rectangle: { x, y, width, height }
 */
export type Rectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FontKey = {
  family: string;
  // Future properties will allow precise font identification and partial fetching.
};

export type Image = TODO;
export type Math2D = TODO;
export type Color = TODO;

interface Grida2DRuntime {
  // ====================================================================================================
  // helpers
  // ====================================================================================================

  /**
   * 2D math utilities.
   */
  readonly math2d: Math2D;

  /**
   * WebGL context.
   */
  readonly GL: TODO;

  // ====================================================================================================
  // colors
  // ====================================================================================================
  readonly RED: Color;
  readonly GREEN: Color;
  readonly BLUE: Color;
  readonly WHITE: Color;
  readonly BLACK: Color;
  readonly TRANSPARENT: Color;

  /**
   * width of the canvas in pixels.
   * @default 0 when not loaded.
   */
  readonly width: number;

  /**
   * height of the canvas in pixels.
   * @default 0 when not loaded.
   */
  readonly height: number;

  // ====================================================================================================
  // scene
  // ====================================================================================================

  /**
   * load a scene
   * @param scene
   */
  loadScene(scene: TODO): void;
}

export interface Grida2DScene extends Grida2DRuntime {
  /**
   * name of the scene.
   * @get @set
   */
  name: string;

  /**
   * 2D camera.
   * @get
   */
  readonly camera2D: Camera2D;

  // ====================================================================================================
  // document
  // ====================================================================================================

  /**
   * @returns the current selection.
   *
   * @privateRemarks
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection
   */
  getSelection(): TODO;

  /**
   * @param id - id of the node.
   * @returns node with given id, or null if not found.
   *
   * @privateRemarks
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementById
   */
  getNodeById(id: string): TODO | null;

  /**
   * @privateRemarks
   * execute a command like `copy` `cut` `paste` `delete` `undo` `redo`
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
   */
  execCommand(command: TODO): TODO;

  /**
   * @returns node at given point (world space).
   *
   * @param x - x coordinate in world units.
   * @param y - y coordinate in world units.
   *
   * @privateRemarks
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/elementFromPoint
   */
  nodeFromPoint(x: number, y: number): TODO;

  /**
   * @returns nodes at given point (world space).
   *
   * @param x - x coordinate in world units.
   * @param y - y coordinate in world units.
   *
   * @privateRemarks
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/elementsFromPoint
   */
  nodesFromPoint(x: number, y: number): TODO;

  /**
   * @param node - node to import.
   * @returns imported node.
   *
   * @privateRemarks
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/importNode
   */
  importNode(node: TODO): TODO;

  loadImage(url: string): Promise<Image>;
  registerImage(image: Image): TODO;
  /**
   * Register a font with the renderer.
   * @param family - CSS font-family name.
   * @param data - Raw font bytes.
   */
  registerFont(family: string, data: Uint8Array): void;

  /**
   * @returns true if the scene references fonts that are not yet registered.
   */
  hasMissingFonts(): boolean;

  /**
   * Fonts referenced in the scene that are not yet registered.
   */
  listMissingFonts(): FontKey[];

  /**
   * Fonts currently available in the runtime.
   */
  listAvailableFonts(): FontKey[];

  /**
   * Set the default fallback font families. Order matters.
   */
  setFallbackFonts(fonts: string[]): void;

  /**
   * Get the current default fallback font families.
   */
  getFallbackFonts(): string[];

  /**
   * @privateRemarks
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/fonts
   */
  fonts: TODO;

  /**
   * @privateRemarks
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/images
   */
  images: TODO;

  /**
   * @default 100x100 rectangle
   */
  createRectangleNode(): TODO;

  /**
   * @default 100x0 straight line
   */
  createLineNode(): TODO;

  /**
   * @default 100x100 circle
   */
  createCircleNode(): TODO;

  /**
   * @default 100x100 ellipse
   */
  createEllipseNode(): TODO;

  /**
   * @param data - SVG path data string.
   */
  createPathNode(data: string): TODO;

  /**
   * @param text - text to render.
   */
  createTextNode(): TODO;

  /**
   * @default 3-point-triangle
   */
  createPolygonNode(): TODO;

  /**
   * @default 3-point-triangle
   */
  createRegularPolygonNode(): TODO;

  /**
   * @default 5-point-star
   */
  createRegularStarNode(): TODO;

  createImageNode(): TODO;
}

export interface Camera2D {
  /**
   * 2D transform matrix of the camera.
   * @get
   */
  readonly matrix: Transform2D;

  /**
   * translates (delta) the camera by (dx, dy) in world units.
   */
  translate(dx: number, dy: number): void;

  /**
   * zoom level of the camera.
   * @get @set
   */
  zoom: number;

  /**
   * center of the camera in world units.
   * @get @set
   */
  center: Vector2;

  /**
   * World‐space rect currently visible.
   * @get
   */
  readonly rect: Rectangle;

  /**
   * Converts a screen-space point to canvas coordinates using the inverse view matrix.
   */
  screenPointToWorldPoint(point: Vector2): Vector2;
}
