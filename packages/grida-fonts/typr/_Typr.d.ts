///
/// https://github.com/blutorange/Typr.js/blob/npm%2Btypescript/src/index.d.ts
///

/**
 * The main entry point of the library. It contains the {@link parse} function
 * and the {@link Util} object for various operations on the font object.
 */
export interface Typr {
  /**
   * Parses a TTF/OTF file and returns a font object. The returned object has a structure, which
   * corresponds to the structure of the TTF/OTF file. I.e. it is a set of tables, each table
   * has its own structure.
   * @param buffer Binary data of the TTF or OTF font, such as an {@link ArrayBuffer}.
   * @returns A list of all fonts in the file.
   */
  parse: (buffer: Iterable<number> | ArrayBufferLike) => FontObject[];

  /**
   * Functions for working with binary data.
   */
  B: BinaryHelper;

  /**
   * Processor for individual font tab fields.
   */
  T: FontTab;

  // /**
  //  * Utility functions that operate on {@link FontObject font object} created
  //  * by the {@link parse} function.
  //  */
  // U: Util;
}

/**
 * Helper for working with binary data.
 */
export interface BinaryHelper {
  /**
   * Reads a 16-bit signed fixed-point number (2.14) from the data.
   * @param data Data to read from.
   * @param position Position in the data.
   * @returns The read number.
   */
  readFixed: (data: Uint8Array, position: number) => number;
  /**
   * Reads a signed short from the data and divides it by 0x4000.
   * @param data Data to read from.
   * @param position Position in the data.
   * @returns The read number.
   */
  readF2dot14: (data: Uint8Array, position: number) => number;
  /**
   * Reads a signed 32-bit integer from the data.
   * @param data Data to read from.
   * @param position Position in the data.
   * @returns The read number.
   */
  readInt: (data: Uint8Array, position: number) => number;
  /**
   * Reads a signed 8-bit integer from the data.
   * @param data Data to read from.
   * @param position Position in the data.
   * @returns The read number.
   */
  readInt8: (data: Uint8Array, position: number) => number;
  /**
   * Reads a signed 16-bit integer from the data.
   * @param data Data to read from.
   * @param position Position in the data.
   * @returns The read number.
   */
  readShort: (data: Uint8Array, position: number) => number;
  /**
   * Reads an unsigned 16-bit integer from the data.
   * @param data Data to read from.
   * @param position Position in the data.
   * @returns The read number.
   */
  readUshort: (data: Uint8Array, position: number) => number;
  /**
   * Writes an unsigned 16-bit integer to the data.
   * @param data Data to write to.
   * @param position Position in the data.
   * @param n Number to write.
   * @returns The read number.
   */
  writeUshort: (data: Uint8Array, position: number, n: number) => void;
  /**
   * Reads an array of unsigned 16-bit integers from the data.
   * @param data Data to read from.
   * @param position Position in the data.
   * @param length Number of integers to read.
   * @returns The read numbers.
   */
  readUshorts: (data: Uint8Array, position: number, length: number) => number[];
  /**
   * Reads an unsigned 32-bit integer from the data.
   * @param data Data to read from.
   * @param position Position in the data.
   * @returns The read number.
   */
  readUint: (data: Uint8Array, position: number) => number;
  /**
   * Writes an unsigned 32-bit integer to the data.
   * @param data Data to write to.
   * @param position Position in the data.
   * @param n Number to write.
   * @returns The read number.
   */
  writeUint: (data: Uint8Array, position: number, n: number) => void;
  /**
   * Reads an unsigned 64-bit integer from the data.
   * @param data Data to read from.
   * @param position Position in the data.
   * @returns The read number.
   */
  readUint64: (data: Uint8Array, position: number) => number;
  /**
   * Reads an ASCII string from the data.
   * @param data Data to read from.
   * @param position Position in the data.
   * @param length Length in characters.
   * @returns The read string.
   */
  readASCII: (data: Uint8Array, position: number, length: number) => string;
  /**
   * Writes an ASCII string to the data.
   * @param data Data to write to.
   * @param position Position in the data.
   * @param str String to write.
   */
  writeASCII: (data: Uint8Array, position: number, str: string) => void;
  /**
   * Reads 16-bit signed integers from the data, interpreting them as Unicode
   * code points and returning a string from these code points.
   * @param data Data to read from.
   * @param position Position in the data.
   * @param length Number of characters to read.
   * @returns The read string.
   */
  readUnicode: (data: Uint8Array, position: number, length: number) => string;
  /**
   * Reads a UTF-8 string from the data.
   * @param data Data to read from.
   * @param position Position in the data.
   * @param length Number of bytes to read.
   * @returns The read string.
   */
  readUTF8: (data: Uint8Array, position: number, length: number) => string;
  /**
   * Reads a fixed number of bytes from the data.
   * @param data Data to read from.
   * @param position Position in the data.
   * @param length Number of bytes to read.
   * @returns The read bytes.
   */
  readBytes: (data: Uint8Array, position: number, length: number) => number[];
  /**
   * Reads the given number of ASCII strings from the data, and returns an array
   * with one entry for each character.
   * @param data Data to read from.
   * @param position Position in the data.
   * @param length Number of characters to read.
   * @returns The read characters.
   */
  readASCIIArray: (
    data: Uint8Array,
    position: number,
    length: number
  ) => string[];
  /**
   * An array buffer and several views for it.
   */
  t: BinaryBuffer;
}

export interface BinaryBuffer {
  buff: ArrayBuffer;
  int8: Int8Array;
  uint8: Uint8Array;
  int16: Int16Array;
  uint16: Uint16Array;
  int32: Int32Array;
  uint32: Uint32Array;
}

export interface FontCmapSubTable0 {
  format: 0;
  map: number[];
}

export interface FontCmapSubTable4 {
  format: 4;
  searchRange: number;
  entrySelector: number;
  rangeShift: number;
  endCount: number[];
  startCount: number[];
  idDelta: number[];
  idRangeOffset: number[];
  glyphIdArray: number[];
}

export interface FontCmapSubTable6 {
  format: 6;
  firstCode: number;
  glyphIdArray: number[];
}

export interface FontCmapSubTable12 {
  format: 12;
  groups: Uint32Array;
}

export type FontCmapSubTable =
  | FontCmapSubTable0
  | FontCmapSubTable4
  | FontCmapSubTable6
  | FontCmapSubTable12;

export interface FontCmap {
  tables: FontCmapSubTable[];
  ids: Record<string, number>;
  off: number;
}

export type FontCblcEntry = [
  fgI: number,
  lgI: number,
  imF: number,
  oarr: number[],
];

export type FontCblc = FontCblcEntry[];

export type FontCbdt = Uint8Array;

export type FontGlyfEntry = null;

export type FontGlyf = FontGlyfEntry[];

/**
 * Head data of a {@link FontObject}.
 */
export interface FontHead {
  fontRevision: number;
  flags: number;
  unitsPerEm: number;
  created: number;
  modified: number;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  macStyle: number;
  lowestRecPPEM: number;
  fontDirectionHint: number;
  indexToLocFormat: number;
  glyphDataFormat: number;
}

export interface FontHhea {
  ascender: number;
  descender: number;
  lineGap: number;
  advanceWidthMax: number;
  minLeftSideBearing: number;
  minRightSideBearing: number;
  xMaxExtent: number;
  caretSlopeRise: number;
  caretSlopeRun: number;
  caretOffset: number;
  res0: number;
  res1: number;
  res2: number;
  res3: number;
  metricDataFormat: number;
  numberOfHMetrics: number;
}

export interface FontHmtx {
  aWidth: number[];
  lsBearing: number[];
}

export interface FontKernRVal {
  glyph2: number[];
  val: number[];
}

export interface FontKern {
  glyph1: number[][];
  rval: FontKernRVal[];
}

export type FontLoca = number[];

export interface FontMaxp {
  numGlyphs: number;
}

export interface FontName {
  _lang?: number;
  copyright?: string;
  fontFamily?: string;
  fontSubfamily?: string;
  ID?: string;
  fullName?: string;
  version?: string;
  postScriptName?: string;
  trademark?: string;
  manufacturer?: string;
  designer?: string;
  description?: string;
  urlVendor?: string;
  urlDesigner?: string;
  licence?: string;
  licenceURL?: string;
  typoFamilyName?: string;
  typoSubfamilyName?: string;
  compatibleFull?: string;
  sampleText?: string;
  postScriptCID?: string;
  wwsFamilyName?: string;
  wwsSubfamilyName?: string;
  lightPalette?: string;
  darkPalette?: string;
}

export interface FontOs2Version0 {
  xAvgCharWidth: number;
  usWeightClass: number;
  usWidthClass: number;
  fsType: number;
  ySubscriptXSize: number;
  ySubscriptYSize: number;
  ySubscriptXOffset: number;
  ySubscriptYOffset: number;
  ySuperscriptXSize: number;
  ySuperscriptYSize: number;
  ySuperscriptXOffset: number;
  ySuperscriptYOffset: number;
  yStrikeoutSize: number;
  yStrikeoutPosition: number;
  sFamilyClass: number;
  panose: number;
  ulUnicodeRange1: number;
  ulUnicodeRange2: number;
  ulUnicodeRange3: number;
  ulUnicodeRange4: number;
  achVendID: string;
  fsSelection: number;
  usFirstCharIndex: number;
  usLastCharIndex: number;
  sTypoAscender: number;
  sTypoDescender: number;
  sTypoLineGap: number;
  usWinAscent: number;
  usWinDescent: number;
}
export interface FontOs2Version1 extends FontOs2Version0 {
  ulCodePageRange1: number;
  ulCodePageRange2: number;
}
export interface FontOs2Version2 extends FontOs2Version1 {
  sxHeight: number;
  sCapHeight: number;
  usDefault: number;
  usBreak: number;
  usMaxContext: number;
}
export interface FontOs2Version3 extends FontOs2Version2 {}
export interface FontOs2Version4 extends FontOs2Version3 {}
export interface FontOs2Version5 extends FontOs2Version4 {
  usLowerOpticalPointSize: number;
  usUpperOpticalPointSize: number;
}

export type FontOs2 =
  | FontOs2Version0
  | FontOs2Version1
  | FontOs2Version2
  | FontOs2Version3
  | FontOs2Version4
  | FontOs2Version5;

export interface FontPost {
  version: number;
  italicAngle: number;
  underlinePosition: number;
  underlineThickness: number;
}

export interface FontSvg {
  entries: number[];
  svgs: string[];
}

export type FontSbix = (Uint8Array | null)[];

export type FontColr = [base: Record<string, [number, number]>, lays: number[]];

export type FontCpal = Uint8Array;

export interface FontCffDictBase {
  Copyright: number | number[];
  isFixedPitch: number | number[];
  ItalicAngle: number | number[];
  UnderlinePosition: number | number[];
  UnderlineThickness: number | number[];
  PaintType: number | number[];
  CharstringType: number | number[];
  FontMatrix: number | number[];
  StrokeWidth: number | number[];
  BlueScale: number | number[];
  BlueShift: number | number[];
  BlueFuzz: number | number[];
  StemSnapH: number | number[];
  StemSnapV: number | number[];
  ForceBold: number | number[];
  LanguageGroup: number | number[];
  ExpansionFactor: number | number[];
  initialRandomSeed: number | number[];
  SyntheticBase: number | number[];
  PostScript: number | number[];
  BaseFontName: number | number[];
  BaseFontBlend: number | number[];
  ROS: number | number[];
  CIDFontVersion: number | number[];
  CIDFontRevision: number | number[];
  CIDFontType: number | number[];
  CIDCount: number | number[];
  UIDBase: number | number[];
  FontName: number | number[];
  version: number | number[];
  Notice: number | number[];
  FullName: number | number[];
  FamilyName: number | number[];
  Weight: number | number[];
  FontBBox: number | number[];
  BlueValues: number | number[];
  OtherBlues: number | number[];
  FamilyBlues: number | number[];
  FamilyOtherBlues: number | number[];
  StdHW: number | number[];
  StdVW: number | number[];
  escape: number | number[];
  UniqueID: number | number[];
  XUID: number | number[];
  Encoding: number | number[];
  Private: number | number[];
  defaultWidthX: number | number[];
  nominalWidthX: number | number[];
}

export interface FontCffDict extends FontCffDictBase {
  charset: number | number[];
  Subrs: number | number[];
  CharStrings: number | number[];
  FDArray: number | number[];
  FDSelect: number | number[];
}

export interface FontCff extends FontCffDictBase {
  CharStrings: Uint8Array[];
  Subrs: Uint8Array[];
  Bias: number;
  charset: [string, ...number[]];
  FDSelect: number[];
  FDArray: FontCffDict[];
}

export interface FontTab {
  CFF: FontTabProcessor<FontCff>;
  cmap: FontTabProcessor<FontCmap>;
  CBLC: FontTabProcessor<FontCblc>;
  CBDT: FontTabProcessor<FontCbdt>;
  glyf: FontTabProcessor<FontGlyf>;
  head: FontTabProcessor<FontHead>;
  hhea: FontTabProcessor<FontHhea>;
  hmtx: FontTabProcessor<FontHmtx>;
  kern: FontTabProcessor<FontKern>;
  loca: FontTabProcessor<FontLoca>;
  maxp: FontTabProcessor<FontMaxp>;
  name: FontTabProcessor<FontName>;
  OS2: FontTabProcessor<FontOs2>;
  post: FontTabProcessor<FontPost>;
  SVG: FontTabProcessor<FontSvg>;
  sbix: FontTabProcessor<FontSbix>;
  colr: FontTabProcessor<FontColr>;
  cpal: FontTabProcessor<FontCpal>;
}

export interface FontParseState {
  _data: Uint8Array;
  _index: number;
  _offset: number;
}

export interface FontTabProcessor<T> {
  /**
   * Parses a tab of the font data.
   * @param data Data to parse.
   * @param offset Offset of the data.
   * @param length Length of the data.
   * @returns The parsed data.
   */
  parseTab: (
    data: Uint8Array,
    offset: number,
    length: number,
    obj: FontParseState
  ) => T;
}

/**
 * The central object of the library. It contains all the information about a parsed
 * font. Use the {@link parse} function to create a font object, and use {@link Util}
 * to perform various operations on it.
 */
export interface FontObject {
  head?: FontHead;
  cmap?: FontCmap;
  hhea?: FontHhea;
  maxp?: FontMaxp;
  hmtx?: FontHmtx;
  name?: FontName;
  "OS/2"?: FontOs2;
  post?: FontPost;
  loca?: FontLoca;
  kern?: FontKern;
  glyf?: FontGlyf;
  "CFF "?: FontCff;
  CBLC?: FontCblc;
  CBDT?: FontCbdt;
  "SVG "?: FontSvg;
  COLR?: FontColr;
  CPAL?: FontCpal;
  sbix?: FontSbix;
}

/**
 * Contains utility functions for working with SVG.
 */
export interface SvgUtil {
  /**
   * Parses a CSS string and returns a map of CSS properties.
   * @param str CSS string.
   * @returns Map of CSS properties.
   */
  cssMap: (str: string) => Record<string, string>;
  readTrnf: (trna: string) => number[];
  /**
   * Parses an SVG path string and adds the commands to the given {@link VectorPath}.
   * @param d An SVG path string.
   * @param pth A {@link VectorPath} object to modify.
   */
  svgToPath: (d: string, pth: VectorPath) => void;
  /**
   * Converts an SVG to a {@link VectorPath}.
   * @param svg An SVG element.
   * @param gid Optional ID of the glyph to convert. The element should have the ID `glyph${gid}`.
   * @returns The vector path of the outline of the SVG.
   */
  toPath: (svg: SVGElement, gid?: string) => VectorPath;
}

/**
 * Possible commands for {@link VectorPath.cmds}.
 *
 * - `M` - (1 coordinate (X,Y)) Move the pointer to X,Y.
 * - `L` - (1 coordinate (X,Y)) Draw a line from the current point to X,Y.
 * - `Q` - (2 coordinates (X1,Y1,X2,Y2)) Draw a quadratic Bézier curve from the previous
 *   position to X2,Y2, using X1,Y1 as a control point.
 * - `C` - (3 coordinates (X1,Y1,X2,Y2,X3,Y3)) Draw a cubic Bézier curve from the previous
 *   position to X3,Y3, using X1,Y1 and X2,Y2 as control points.
 * - `Z` - (0 coordinates) Draw a line to the first point to finish the outline.
 */
export type VectorPathCommand = "M" | "L" | "Q" | "C" | "Z";

/**
 * A vector path as returned by {@link Util.glyphToPath} or {@link Util.glyphsToPath}.
 */
export interface VectorPath {
  /**
   * An array of commands, each command is a string. Each command needs a specific number
   * of coordinates from {@link crds}, which must contain exactly as many coordinates
   * as requires by all commands in this array.
   */
  cmds: VectorPathCommand[];

  /**
   * An array of (x-y) coordinate pairs for {@link cmds}. Must have an even number of
   * elements, each pair is an (x, y) coordinate.
   */
  crds: number[];
}

/**
 * Info about a glyph from a font, as returned by {@link Util.shape}.
 */
export interface GlyphInfo {
  /** The glyph index of the character. */
  g: number;

  /** The cluster index of the character. */
  cl: number;

  /** The x offset from a pen (baseline), at which the glyph should be draw. */
  dx: number;

  /** The y offset from a pen (baseline), at which the glyph should be draw. */
  dy: number;

  /** The advance x of the glyph. */
  ax: number;

  /** The advance y of the glyph. */
  ay: number;
}

/**
 * Utility functions that operate on {@link FontObject font object} created
 * by the {@link parse} function.
 */
export interface Util {
  /**
   * @param Font Font object to process.
   * @param Code integer code of the character.
   * @returns Integer index of the glyph, corresponding to the unicode character
   */
  codeToGlyph: (font: FontObject, code: number) => number;

  /**
   *
   * @param font Font object to process.
   * @param gid Index of the glyph, which you want to access.
   * @returns The vector path of the outline of the glyph.
   */
  glyphToPath: (font: FontObject, gid: number) => VectorPath;

  /**
   * This function executes each command of the path with a corresponding command of
   * {@link CanvasRenderingContext2D} such as {@link CanvasRenderingContext2D.moveTo moveTo()},
   * {@link CanvasRenderingContext2D.lineTo lineTo()}, etc. It does nothing else (you
   * must do `translate()`, `scale()`, `fillStyle()`, `fill()`, `stroke()`, etc. manually).
   * @param path Path to draw
   * @param ctx Canvas context to draw the path into.
   */
  pathToContext: (path: VectorPath, ctx: CanvasRenderingContext2D) => void;

  /**
   * Converts a path to an "SVG path string", which can be used in `<path d="..." />`.
   * @param path Path to convert.
   * @returns The SVG path string.
   */
  pathToSVG: (path: VectorPath) => string;

  /**
   * Converts a piece of text to a shape, using the font object.
   * @param Font font object to process.
   * @param str Text to convert.
   * @param ltr If true, the text is left-to-right, otherwise right-to-left.
   * Default is left-to-right.
   * @returns A geometric description representing the text, one for each glyph.
   */
  shape: (font: FontObject, str: string, ltr?: boolean) => GlyphInfo[];

  /**
   * Same as {@link shape}, but uses HarfBuzz for advanced text shaping.
   * Available only once {@link initHB} was called and HarfBuzz is loaded,
   * i.e. once the callback passed to {@link initHB} was called.
   *
   * Converts a piece of text to a shape, using the font object.
   * @param Font font object to process.
   * @param str Text to convert.
   * @param ltr If true, the text is left-to-right, otherwise right-to-left.
   * Default is left-to-right.
   * @returns A geometric description representing the text, one for each glyph.
   */
  shapeHB?: (font: FontObject, str: string, ltr?: boolean) => GlyphInfo[];

  /**
   * Converts a shape to a vector path.
   * @param font Font object to process.
   * @param shape Shape to convert.
   * @param clr Optional command to add at the end of the path.
   * @returns The vector path of the outline of the shape.
   */
  shapeToPath: (
    font: FontObject,
    shape: GlyphInfo[],
    clr?: VectorPathCommand
  ) => VectorPath;

  /**
   * {@lik shape} provides only basic text shaping. For advanced shaping, Typr.js
   * can be integrated with a [HarfBuzz](http://www.harfbuzz.org/) shaping library.
   * HarfBuzz supports advanced shaping of Arabic, Urdu, Farsi, Khmer, You need a
   * WASM version of the library. The integration is done through a following function.
   *
   * Once the HarfBuzz is loaded, you can use {@link shapeHB} instead of {@link shape}.
   * It accepts identical parameters and returns a shape in the identical format, which
   * can be used with e.g. {@link shapeToPath}.
   * @param url The URL of the HarfBuzz WASM file.
   * @param callback A callback function, that is called when the HarfBuzz is loaded and ready to use.
   */
  initHB: (url: string | URL, callback: () => void) => void;

  /**
   * Utility functions for working with SVG.
   */
  SVG: SvgUtil;

  /**
   * Converts an SVG path string to a {@link VectorPath}.
   * @param d An SVG path string.
   * @returns The vector path of the outline of the SVG.
   */
  SVGToPath: (d: string) => VectorPath;
}

/**
 * The main entry point of the library. It contains the {@link parse} function
 * and the {@link Util} object for various operations on the font object.
 */
export declare const Typr: Typr;
