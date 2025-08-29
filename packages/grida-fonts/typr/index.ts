///
/// https://github.com/photopea/Typr.js/blob/gh-pages/src/Typr.js
/// TypeScript version with modern namespace syntax and strong typing
///

// Parser Interface Types
interface TableParser {
  parseTab: (
    data: Uint8Array,
    offset: number,
    length: number,
    font?: Typr.FontData
  ) => any;
}

interface NameTableParser extends TableParser {
  selectOne: (obj: any) => any;
}

interface OS2TableParser extends TableParser {
  version0: (data: Uint8Array, offset: number, obj: any) => number;
  version1: (data: Uint8Array, offset: number, obj: any) => number;
  version2: (data: Uint8Array, offset: number, obj: any) => number;
  version5: (data: Uint8Array, offset: number, obj: any) => number;
}

interface KernTableParser extends TableParser {
  parseV1: (
    data: Uint8Array,
    offset: number,
    length: number,
    font: Typr.FontData
  ) => any;
  readFormat0: (data: Uint8Array, offset: number, map: any) => number;
}

interface CFFTableParser extends TableParser {
  readIndex: (data: Uint8Array, offset: number, inds: number[]) => number;
  readDict: (data: Uint8Array, offset: number, end: number) => any;
  readSubrs: (data: Uint8Array, offset: number, obj: any) => void;
  readBytes: (data: Uint8Array, offset: number) => Uint8Array[];
  _readFDict: (data: Uint8Array, dict: any, ss: string[]) => void;
  readCharset: (data: Uint8Array, offset: number, num: number) => number[];
  glyphByUnicode: (cff: Typr.CFFTable, code: number) => number;
  glyphBySE: (cff: Typr.CFFTable, charcode: number) => number;
  tableSE: number[];
  getCharString: (data: Uint8Array, offset: number, o: any) => void;
  readCharString: (data: Uint8Array, offset: number, length: number) => any[];
}

interface CmapTableParser extends TableParser {
  parse0: (
    data: Uint8Array,
    offset: number,
    obj: Typr.CmapSubtable
  ) => Typr.CmapSubtable;
  parse4: (
    data: Uint8Array,
    offset: number,
    obj: Typr.CmapSubtable
  ) => Typr.CmapSubtable;
  parse6: (
    data: Uint8Array,
    offset: number,
    obj: Typr.CmapSubtable
  ) => Typr.CmapSubtable;
  parse12: (
    data: Uint8Array,
    offset: number,
    obj: Typr.CmapSubtable
  ) => Typr.CmapSubtable;
}

// Binary reader types
interface BinaryReader {
  readFixed: (data: Uint8Array, offset: number) => number;
  readF2dot14: (data: Uint8Array, offset: number) => number;
  readInt: (buff: Uint8Array, offset: number) => number;
  readInt8: (buff: Uint8Array, offset: number) => number;
  readShort: (buff: Uint8Array, offset: number) => number;
  readUshort: (buff: Uint8Array, offset: number) => number;
  writeUshort: (buff: Uint8Array, offset: number, value: number) => void;
  readUshorts: (buff: Uint8Array, offset: number, length: number) => number[];
  readUint: (buff: Uint8Array, offset: number) => number;
  writeUint: (buff: Uint8Array, offset: number, value: number) => void;
  readUint64: (buff: Uint8Array, offset: number) => number;
  readASCII: (buff: Uint8Array, offset: number, length: number) => string;
  writeASCII: (buff: Uint8Array, offset: number, str: string) => void;
  readUnicode: (buff: Uint8Array, offset: number, length: number) => string;
  readUTF8: (buff: Uint8Array, offset: number, length: number) => string;
  readBytes: (buff: Uint8Array, offset: number, length: number) => number[];
  readASCIIArray: (
    buff: Uint8Array,
    offset: number,
    length: number
  ) => string[];
  t: {
    buff: ArrayBuffer;
    int8: Int8Array;
    uint8: Uint8Array;
    int16: Int16Array;
    uint16: Uint16Array;
    int32: Int32Array;
    uint32: Uint32Array;
  };
}

// Modern TypeScript namespace
namespace Typr {
  // Find table function
  export function findTable(
    data: Uint8Array,
    tab: string,
    foff: number
  ): [number, number] | null {
    const bin = Typr.B;
    const numTables = bin.readUshort(data, foff + 4);
    let offset = foff + 12;
    for (let i = 0; i < numTables; i++) {
      const tag = bin.readASCII(data, offset, 4);
      const checkSum = bin.readUint(data, offset + 4);
      const toffset = bin.readUint(data, offset + 8);
      const length = bin.readUint(data, offset + 12);
      if (tag == tab) return [toffset, length];
      offset += 16;
    }
    return null;
  }

  // Main parse function
  export function parse(buff: ArrayBuffer | Uint8Array): FontData[] {
    const bin = Typr.B;

    const readFont = function (
      data: Uint8Array,
      idx: number,
      offset: number,
      tmap: TableMap
    ): FontData {
      const T = Typr.T;
      const prsr: { [key: string]: TableParser } = {
        cmap: T.cmap,
        head: T.head,
        hhea: T.hhea,
        maxp: T.maxp,
        hmtx: T.hmtx,
        name: T.name,
        "OS/2": T.OS2,
        post: T.post,

        loca: T.loca,
        kern: T.kern,
        glyf: T.glyf,

        "CFF ": T.CFF,
        GSUB: T.GSUB,
        CBLC: T.CBLC,
        CBDT: T.CBDT,

        "SVG ": T.SVG,
        COLR: T.colr,
        CPAL: T.cpal,
        sbix: T.sbix,

        fvar: T.fvar,
        gvar: T.gvar,
        avar: T.avar,
        STAT: T.STAT,
        HVAR: T.HVAR,
      };
      const obj: FontData = { _data: data, _index: idx, _offset: offset };

      for (const t in prsr) {
        const tab = Typr.findTable(data, t, offset);
        if (tab) {
          const off = tab[0];
          let tobj = tmap[off];
          if (tobj == null) tobj = prsr[t].parseTab(data, off, tab[1], obj);
          obj[t] = tmap[off] = tobj;
        }
      }
      return obj;
    };

    function woffToOtf(data: Uint8Array): Uint8Array {
      const numTables = bin.readUshort(data, 12);
      const totalSize = bin.readUint(data, 16);

      const otf = new Uint8Array(totalSize);
      let toff = 12 + numTables * 16;

      bin.writeASCII(otf, 0, "OTTO");
      bin.writeUshort(otf, 4, numTables);

      let off = 44;
      for (let i = 0; i < numTables; i++) {
        const tag = bin.readASCII(data, off, 4);
        const tof = bin.readUint(data, off + 4);
        const cLe = bin.readUint(data, off + 8);
        const oLe = bin.readUint(data, off + 12);
        off += 20;

        let tab = data.slice(tof, tof + cLe);
        if (cLe != oLe) {
          // Note: pako is not available in TypeScript, you'll need to handle this
          // tab = pako.inflate(tab);
          console.warn("pako inflate not available, using original data");
          // In a real implementation, you would need to import pako or use a different decompression library
        }

        const to = 12 + i * 16;
        bin.writeASCII(otf, to, tag);
        bin.writeUint(otf, to + 8, toff);
        bin.writeUint(otf, to + 12, oLe);

        otf.set(tab, toff);
        toff += oLe;
      }
      return otf;
    }

    let data = buff instanceof Uint8Array ? buff : new Uint8Array(buff);
    if (data[0] == 0x77) data = woffToOtf(data);

    const tmap: TableMap = {};
    const tag = bin.readASCII(data, 0, 4);
    if (tag == "ttcf") {
      let offset = 4;
      const majV = bin.readUshort(data, offset);
      offset += 2;
      const minV = bin.readUshort(data, offset);
      offset += 2;
      const numF = bin.readUint(data, offset);
      offset += 4;
      const fnts: FontData[] = [];
      for (let i = 0; i < numF; i++) {
        const foff = bin.readUint(data, offset);
        offset += 4;
        fnts.push(readFont(data, i, foff, tmap));
      }
      return fnts;
    }
    const fnt = readFont(data, 0, 0, tmap);
    const fvar = fnt["fvar"];
    if (fvar && fvar[1] && Array.isArray(fvar[1])) {
      const out: FontData[] = [fnt];
      for (let i = 0; i < fvar[1].length; i++) {
        const fv = fvar[1][i];
        const obj: FontData = {
          _data: fnt._data,
          _index: i,
          _offset: fnt._offset,
        };
        out.push(obj);
        for (const p in fnt) obj[p] = fnt[p];
        const name = (obj["name"] = JSON.parse(JSON.stringify(obj["name"])));
        name["fontSubfamily"] = (fv as any)[0];
        if ((fv as any)[3] == null)
          (fv as any)[3] = (
            name["fontFamily"] +
            "-" +
            name["fontSubfamily"]
          ).replaceAll(" ", "");
        name["postScriptName"] = (fv as any)[3];
      }
      return out;
    }

    return [fnt];
  }

  // Types

  export interface FontData {
    _data: Uint8Array;
    _index: number;
    _offset: number;
    cmap?: CmapTable;
    head?: HeadTable;
    hhea?: HheaTable;
    maxp?: MaxpTable;
    hmtx?: HmtxTable;
    name?: NameTable;
    "OS/2"?: OS2Table;
    post?: PostTable;
    loca?: LocaTable;
    kern?: KernTable;
    glyf?: GlyfTable;
    "CFF "?: CFFTable;
    GSUB?: GSUBTable;
    CBLC?: CBLCTable;
    CBDT?: CBDTTable;
    "SVG "?: SVGTable;
    COLR?: COLRTable;
    CPAL?: CPALTable;
    sbix?: SBIXTable;
    fvar?: FVARTable;
    gvar?: GVARTable;
    avar?: AVARTable;
    STAT?: STATTable;
    HVAR?: HVARTable;
    [key: string]: any; // Allow dynamic table access
  }

  export interface TableMap {
    [key: number]: any;
  }

  // CMAP Table Types
  export interface CmapTable {
    tables: CmapSubtable[];
    ids: { [key: string]: number };
    off: number;
  }

  export interface CmapSubtable {
    format: number;
    map?: number[];
    endCount?: number[];
    startCount?: number[];
    idDelta?: number[];
    idRangeOffset?: number[];
    glyphIdArray?: number[];
    firstCode?: number;
    groups?: Uint32Array;
    searchRange?: number;
    entrySelector?: number;
    rangeShift?: number;
  }

  // HEAD Table Types
  export interface HeadTable {
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

  // HHEA Table Types
  export interface HheaTable {
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

  // HMTX Table Types
  export interface HmtxTable {
    aWidth: number[];
    lsBearing: number[];
  }

  // MAXP Table Types
  export interface MaxpTable {
    numGlyphs: number;
  }

  // NAME Table Types
  export interface NameTable {
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
    [key: string]: any;
  }

  // OS/2 Table Types
  export interface OS2Table {
    xAvgCharWidth?: number;
    usWeightClass?: number;
    usWidthClass?: number;
    fsType?: number;
    ySubscriptXSize?: number;
    ySubscriptYSize?: number;
    ySubscriptXOffset?: number;
    ySubscriptYOffset?: number;
    ySuperscriptXSize?: number;
    ySuperscriptYSize?: number;
    ySuperscriptXOffset?: number;
    ySuperscriptYOffset?: number;
    yStrikeoutSize?: number;
    yStrikeoutPosition?: number;
    sFamilyClass?: number;
    panose?: number[];
    ulUnicodeRange1?: number;
    ulUnicodeRange2?: number;
    ulUnicodeRange3?: number;
    ulUnicodeRange4?: number;
    achVendID?: string;
    fsSelection?: number;
    usFirstCharIndex?: number;
    usLastCharIndex?: number;
    sTypoAscender?: number;
    sTypoDescender?: number;
    sTypoLineGap?: number;
    usWinAscent?: number;
    usWinDescent?: number;
    ulCodePageRange1?: number;
    ulCodePageRange2?: number;
    sxHeight?: number;
    sCapHeight?: number;
    usDefault?: number;
    usBreak?: number;
    usMaxContext?: number;
    usLowerOpticalPointSize?: number;
    usUpperOpticalPointSize?: number;
  }

  // POST Table Types
  export interface PostTable {
    version: number;
    italicAngle: number;
    underlinePosition: number;
    underlineThickness: number;
  }

  // LOCA Table Types
  export interface LocaTable extends Array<number> {}

  // KERN Table Types
  export interface KernTable {
    glyph1: number[];
    rval: Array<{
      glyph2: number[];
      vals: number[];
    }>;
  }

  // GLYF Table Types
  export interface GlyphContour {
    endPts: number[];
    instructions: number[];
    flags: number[];
    xs: number[];
    ys: number[];
  }

  export interface GlyphComponent {
    glyphIndex: number;
    m: {
      a: number;
      b: number;
      c: number;
      d: number;
      tx: number;
      ty: number;
    };
    p1: number;
    p2: number;
  }

  export interface Glyph {
    noc: number; // number of contours
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
    endPts?: number[];
    instructions?: number[];
    flags?: number[];
    xs?: number[];
    ys?: number[];
    parts?: GlyphComponent[];
    instr?: number[];
  }

  export interface GlyfTable extends Array<Glyph | null> {}

  // CFF Table Types
  export interface CFFTable {
    version?: number;
    Notice?: string;
    FullName?: string;
    FamilyName?: string;
    Weight?: number;
    FontBBox?: number[];
    BlueValues?: number[];
    OtherBlues?: number[];
    FamilyBlues?: number[];
    FamilyOtherBlues?: number[];
    StdHW?: number;
    StdVW?: number;
    UniqueID?: number;
    XUID?: number[];
    charset?: number[];
    Encoding?: any;
    CharStrings?: Uint8Array[];
    Private?: any;
    Subrs?: Uint8Array[];
    defaultWidthX?: number;
    nominalWidthX?: number;
    Bias?: number;
    ROS?: any;
    FDArray?: any[];
    FDSelect?: number[];
    [key: string]: any;
  }

  // GSUB Table Types
  export interface GSUBTable {
    [key: string]: boolean;
  }

  // CBLC Table Types
  export interface CBLCTable
    extends Array<[number, number, number, number[]]> {}

  // CBDT Table Types
  export interface CBDTTable extends Uint8Array {}

  // SVG Table Types
  export interface SVGTable {
    entries: { [key: number]: number };
    svgs: string[];
  }

  // COLR Table Types
  export interface COLRTable
    extends Array<{ [key: string]: [number, number] } | number[]> {}

  // CPAL Table Types
  export interface CPALTable extends Uint8Array {}

  // SBIX Table Types
  export interface SBIXTable extends Array<Uint8Array | null> {}

  // FVAR Table Types
  export interface FVARAxis {
    tag: string;
    min: number;
    def: number;
    max: number;
    flg: number;
    name: string;
  }

  export interface FVARInstance {
    name: string;
    flg: number;
    crd: number[];
    pnid: number | null;
  }

  export interface FVARTable extends Array<FVARAxis[] | FVARInstance[]> {
    0: FVARAxis[];
    1: FVARInstance[];
  }

  // GVAR Table Types
  export interface GVARTable
    extends Array<Array<[number[][], number[], number[] | null]>> {}

  // AVAR Table Types
  export interface AVARTable extends Array<number[]> {}

  // HVAR Table Types
  export interface HVARTable extends Array<any> {}

  // STAT Table Types

  /**
   * https://learn.microsoft.com/en-us/typography/opentype/spec/stat#axis-records
   */
  export interface STATAxisRecord {
    /**
     * Tag | axisTag | A tag identifying the axis of design variation.
     */
    tag: string;

    /**
     * uint16 | axisNameID | The name ID for entries in the 'name' table that provide a display string for this axis.
     */
    name: string;

    /**
     * uint16 | axisOrdering | A value that applications can use to determine primary sorting of face names, or for ordering of labels when composing family or face names.
     */
    ordering: number;
  }

  /**
   * @see https://learn.microsoft.com/en-us/typography/opentype/spec/stat#axis-value-table-format-1
   */
  export interface STATAxisValueFormat1 {
    format: 1;
    axisIndex: number;
    flags: number;
    name: string;
    value: number;
  }

  /**
   * @see https://learn.microsoft.com/en-us/typography/opentype/spec/stat#axis-value-table-format-2
   */
  export interface STATAxisValueFormat2 {
    format: 2;
    axisIndex: number;
    flags: number;
    name: string;
    nominalValue: number;
    rangeMinValue: number;
    rangeMaxValue: number;
  }

  /**
   * @see https://learn.microsoft.com/en-us/typography/opentype/spec/stat#axis-value-table-format-3
   */
  export interface STATAxisValueFormat3 {
    format: 3;
    axisIndex: number;
    flags: number;
    name: string;
    value: number;
    linkedValue: number;
  }

  /**
   * @see https://learn.microsoft.com/en-us/typography/opentype/spec/stat#axis-value-table-format-4
   */
  export interface STATAxisValueFormat4 {
    format: 4;
    flags: number;
    name: string;
    axisValues: { axisIndex: number; value: number }[];
  }

  export type STATAxisValue =
    | STATAxisValueFormat1
    | STATAxisValueFormat2
    | STATAxisValueFormat3
    | STATAxisValueFormat4;

  export interface STATTable {
    majorVersion: number;
    minorVersion: number;
    designAxes: STATAxisRecord[];
    axisValues: STATAxisValue[];
    elidedFallbackNameID?: number;
  }

  // Binary reader namespace
  export namespace B {
    export function readFixed(data: Uint8Array, offset: number): number {
      const value = Typr.B.readInt(data, offset);
      return value / 65536;
    }

    export function readF2dot14(data: Uint8Array, offset: number): number {
      const num = Typr.B.readShort(data, offset);
      return num / 16384;
    }

    export function readInt(buff: Uint8Array, offset: number): number {
      const a = Typr.B.t.uint8;
      a[0] = buff[offset + 3];
      a[1] = buff[offset + 2];
      a[2] = buff[offset + 1];
      a[3] = buff[offset];
      return Typr.B.t.int32[0];
    }

    export function readInt8(buff: Uint8Array, offset: number): number {
      const a = Typr.B.t.uint8;
      a[0] = buff[offset];
      return Typr.B.t.int8[0];
    }

    export function readShort(buff: Uint8Array, offset: number): number {
      const a = Typr.B.t.uint16;
      a[0] = (buff[offset] << 8) | buff[offset + 1];
      return Typr.B.t.int16[0];
    }

    export function readUshort(buff: Uint8Array, offset: number): number {
      return (buff[offset] << 8) | buff[offset + 1];
    }

    export function writeUshort(
      buff: Uint8Array,
      offset: number,
      value: number
    ): void {
      buff[offset] = (value >> 8) & 255;
      buff[offset + 1] = value & 255;
    }

    export function readUshorts(
      buff: Uint8Array,
      offset: number,
      length: number
    ): number[] {
      const arr: number[] = [];
      for (let i = 0; i < length; i++) {
        const v = Typr.B.readUshort(buff, offset + i * 2);
        arr.push(v);
      }
      return arr;
    }

    export function readUint(buff: Uint8Array, offset: number): number {
      const a = Typr.B.t.uint8;
      a[3] = buff[offset];
      a[2] = buff[offset + 1];
      a[1] = buff[offset + 2];
      a[0] = buff[offset + 3];
      return Typr.B.t.uint32[0];
    }

    export function writeUint(
      buff: Uint8Array,
      offset: number,
      value: number
    ): void {
      buff[offset] = (value >> 24) & 255;
      buff[offset + 1] = (value >> 16) & 255;
      buff[offset + 2] = (value >> 8) & 255;
      buff[offset + 3] = (value >> 0) & 255;
    }

    export function readUint64(buff: Uint8Array, offset: number): number {
      return (
        Typr.B.readUint(buff, offset) * (0xffffffff + 1) +
        Typr.B.readUint(buff, offset + 4)
      );
    }

    export function readASCII(
      buff: Uint8Array,
      offset: number,
      length: number
    ): string {
      let s = "";
      for (let i = 0; i < length; i++)
        s += String.fromCharCode(buff[offset + i]);
      return s;
    }

    export function writeASCII(
      buff: Uint8Array,
      offset: number,
      str: string
    ): void {
      for (let i = 0; i < str.length; i++) buff[offset + i] = str.charCodeAt(i);
    }

    export function readUnicode(
      buff: Uint8Array,
      offset: number,
      length: number
    ): string {
      let s = "";
      for (let i = 0; i < length; i++) {
        const c = (buff[offset++] << 8) | buff[offset++];
        s += String.fromCharCode(c);
      }
      return s;
    }

    export const _tdec: TextDecoder | null =
      typeof TextDecoder !== "undefined" ? new TextDecoder() : null;

    export function readUTF8(
      buff: Uint8Array,
      offset: number,
      length: number
    ): string {
      const tdec = Typr.B._tdec;
      if (tdec && offset == 0 && length == buff.length)
        return tdec.decode(buff);
      return Typr.B.readASCII(buff, offset, length);
    }

    export function readBytes(
      buff: Uint8Array,
      offset: number,
      length: number
    ): number[] {
      const arr: number[] = [];
      for (let i = 0; i < length; i++) arr.push(buff[offset + i]);
      return arr;
    }

    export function readASCIIArray(
      buff: Uint8Array,
      offset: number,
      length: number
    ): string[] {
      const s: string[] = [];
      for (let i = 0; i < length; i++)
        s.push(String.fromCharCode(buff[offset + i]));
      return s;
    }

    export const t = (function () {
      const ab = new ArrayBuffer(8);
      return {
        buff: ab,
        int8: new Int8Array(ab),
        uint8: new Uint8Array(ab),
        int16: new Int16Array(ab),
        uint16: new Uint16Array(ab),
        int32: new Int32Array(ab),
        uint32: new Uint32Array(ab),
      };
    })();
  }

  // Table parsers namespace
  export namespace T {
    // CFF Table Parser
    export const CFF: CFFTableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): CFFTable {
        const bin = Typr.B;
        const CFF = Typr.T.CFF;

        data = new Uint8Array(data.buffer, offset, length);
        offset = 0;

        // Header
        const major = data[offset];
        offset++;
        const minor = data[offset];
        offset++;
        const hdrSize = data[offset];
        offset++;
        const offsize = data[offset];
        offset++;

        // Name INDEX
        const ninds: number[] = [];
        offset = CFF.readIndex(data, offset, ninds);
        const names: string[] = [];

        for (let i = 0; i < ninds.length - 1; i++)
          names.push(
            bin.readASCII(data, offset + ninds[i], ninds[i + 1] - ninds[i])
          );
        offset += ninds[ninds.length - 1];

        // Top DICT INDEX
        const tdinds: number[] = [];
        offset = CFF.readIndex(data, offset, tdinds);
        // Top DICT Data
        const topDicts: any[] = [];
        for (let i = 0; i < tdinds.length - 1; i++)
          topDicts.push(
            CFF.readDict(data, offset + tdinds[i], offset + tdinds[i + 1])
          );
        offset += tdinds[tdinds.length - 1];
        const topdict = topDicts[0];

        // String INDEX
        const sinds: number[] = [];
        offset = CFF.readIndex(data, offset, sinds);
        // String Data
        const strings: string[] = [];
        for (let i = 0; i < sinds.length - 1; i++)
          strings.push(
            bin.readASCII(data, offset + sinds[i], sinds[i + 1] - sinds[i])
          );
        offset += sinds[sinds.length - 1];

        // Global Subr INDEX  (subroutines)
        CFF.readSubrs(data, offset, topdict);

        // charstrings
        if (topdict["CharStrings"])
          topdict["CharStrings"] = CFF.readBytes(data, topdict["CharStrings"]);

        // CID font
        if (topdict["ROS"]) {
          offset = topdict["FDArray"];
          const fdind: number[] = [];
          offset = CFF.readIndex(data, offset, fdind);

          topdict["FDArray"] = [];
          for (let i = 0; i < fdind.length - 1; i++) {
            const dict = CFF.readDict(
              data,
              offset + fdind[i],
              offset + fdind[i + 1]
            );
            CFF._readFDict(data, dict, strings);
            topdict["FDArray"].push(dict);
          }
          offset += fdind[fdind.length - 1];

          offset = topdict["FDSelect"];
          topdict["FDSelect"] = [];
          const fmt = data[offset];
          offset++;
          if (fmt == 3) {
            const rns = bin.readUshort(data, offset);
            offset += 2;
            for (let i = 0; i < rns + 1; i++) {
              topdict["FDSelect"].push(
                bin.readUshort(data, offset),
                data[offset + 2]
              );
              offset += 3;
            }
          } else throw new Error(`Unknown format: ${fmt}`);
        }

        // charset
        if (topdict["charset"] && topdict["CharStrings"])
          topdict["charset"] = CFF.readCharset(
            data,
            topdict["charset"],
            topdict["CharStrings"].length
          );

        CFF._readFDict(data, topdict, strings);
        return topdict;
      },

      _readFDict: function (data: Uint8Array, dict: any, ss: string[]): void {
        const CFF = Typr.T.CFF;
        let offset: number;
        if (dict["Private"]) {
          offset = dict["Private"][1];
          dict["Private"] = CFF.readDict(
            data,
            offset,
            offset + dict["Private"][0]
          );
          if (dict["Private"]["Subrs"])
            CFF.readSubrs(
              data,
              offset + dict["Private"]["Subrs"],
              dict["Private"]
            );
        }
        for (const p in dict)
          if (
            [
              "FamilyName",
              "FontName",
              "FullName",
              "Notice",
              "version",
              "Copyright",
            ].indexOf(p) != -1
          )
            dict[p] = ss[dict[p] - 426 + 35];
      },

      readSubrs: function (data: Uint8Array, offset: number, obj: any): void {
        obj["Subrs"] = Typr.T.CFF.readBytes(data, offset);

        let bias: number;
        const nSubrs = obj["Subrs"].length + 1;
        if (false) bias = 0;
        else if (nSubrs < 1240) bias = 107;
        else if (nSubrs < 33900) bias = 1131;
        else bias = 32768;
        obj["Bias"] = bias;
      },

      readBytes: function (data: Uint8Array, offset: number): Uint8Array[] {
        const bin = Typr.B;
        const arr: number[] = [];
        offset = Typr.T.CFF.readIndex(data, offset, arr);

        const subrs: Uint8Array[] = [];
        const arl = arr.length - 1;
        const no = data.byteOffset + offset;
        for (let i = 0; i < arl; i++) {
          const ari = arr[i];
          subrs.push(
            new Uint8Array(
              data.buffer as ArrayBuffer,
              no + ari,
              arr[i + 1] - ari
            )
          );
        }
        return subrs;
      },

      tableSE: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
        15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
        33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
        51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68,
        69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86,
        87, 88, 89, 90, 91, 92, 93, 94, 95, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 96,
        97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 0,
        111, 112, 113, 114, 0, 115, 116, 117, 118, 119, 120, 121, 122, 0, 123,
        0, 124, 125, 126, 127, 128, 129, 130, 131, 0, 132, 133, 0, 134, 135,
        136, 137, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 138, 0, 139,
        0, 0, 0, 0, 140, 141, 142, 143, 0, 0, 0, 0, 0, 144, 0, 0, 0, 145, 0, 0,
        146, 147, 148, 149, 0, 0, 0, 0,
      ],

      glyphByUnicode: function (cff: CFFTable, code: number): number {
        if (!cff["charset"]) return -1;
        for (let i = 0; i < cff["charset"].length; i++)
          if (cff["charset"][i] == code) return i;
        return -1;
      },

      glyphBySE: function (cff: CFFTable, charcode: number): number {
        // glyph by standard encoding
        if (charcode < 0 || charcode > 255) return -1;
        return Typr.T.CFF.glyphByUnicode(cff, Typr.T.CFF.tableSE[charcode]);
      },

      readCharset: function (
        data: Uint8Array,
        offset: number,
        num: number
      ): number[] {
        const bin = Typr.B;

        const charset: number[] = [0]; // ".notdef" is represented as 0
        const format = data[offset];
        offset++;

        if (format == 0) {
          for (let i = 0; i < num; i++) {
            const first = bin.readUshort(data, offset);
            offset += 2;
            charset.push(first);
          }
        } else if (format == 1 || format == 2) {
          while (charset.length < num) {
            let first = bin.readUshort(data, offset);
            offset += 2;
            let nLeft = 0;
            if (format == 1) {
              nLeft = data[offset];
              offset++;
            } else {
              nLeft = bin.readUshort(data, offset);
              offset += 2;
            }
            for (let i = 0; i <= nLeft; i++) {
              charset.push(first);
              first++;
            }
          }
        } else throw new Error(`Unknown format: ${format}`);

        return charset;
      },

      readIndex: function (
        data: Uint8Array,
        offset: number,
        inds: number[]
      ): number {
        const bin = Typr.B;

        const count = bin.readUshort(data, offset) + 1;
        offset += 2;
        const offsize = data[offset];
        offset++;

        if (offsize == 1)
          for (let i = 0; i < count; i++) inds.push(data[offset + i]);
        else if (offsize == 2)
          for (let i = 0; i < count; i++)
            inds.push(bin.readUshort(data, offset + i * 2));
        else if (offsize == 3)
          for (let i = 0; i < count; i++)
            inds.push(bin.readUint(data, offset + i * 3 - 1) & 0x00ffffff);
        else if (offsize == 4)
          for (let i = 0; i < count; i++)
            inds.push(bin.readUint(data, offset + i * 4));
        else if (count != 1)
          throw new Error(
            `Unsupported offset size: ${offsize}, count: ${count}`
          );

        offset += count * offsize;
        return offset - 1;
      },

      getCharString: function (data: Uint8Array, offset: number, o: any): void {
        const bin = Typr.B;

        const b0 = data[offset];
        const b1 = data[offset + 1];
        const b2 = data[offset + 2];
        const b3 = data[offset + 3];
        const b4 = data[offset + 4];
        let vs = 1;
        let op: number | null = null;
        let val: any = null;
        // operand
        if (b0 <= 20) {
          op = b0;
          vs = 1;
        }
        if (b0 == 12) {
          op = b0 * 100 + b1;
          vs = 2;
        }
        if (21 <= b0 && b0 <= 27) {
          op = b0;
          vs = 1;
        }
        if (b0 == 28) {
          val = bin.readShort(data, offset + 1);
          vs = 3;
        }
        if (29 <= b0 && b0 <= 31) {
          op = b0;
          vs = 1;
        }
        if (32 <= b0 && b0 <= 246) {
          val = b0 - 139;
          vs = 1;
        }
        if (247 <= b0 && b0 <= 250) {
          val = (b0 - 247) * 256 + b1 + 108;
          vs = 2;
        }
        if (251 <= b0 && b0 <= 254) {
          val = -(b0 - 251) * 256 - b1 - 108;
          vs = 2;
        }
        if (b0 == 255) {
          val = bin.readInt(data, offset + 1) / 0xffff;
          vs = 5;
        }

        o.val = val != null ? val : "o" + op;
        o.size = vs;
      },

      readCharString: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): any[] {
        const end = offset + length;
        const bin = Typr.B;
        const arr: any[] = [];

        while (offset < end) {
          const b0 = data[offset];
          const b1 = data[offset + 1];
          const b2 = data[offset + 2];
          const b3 = data[offset + 3];
          const b4 = data[offset + 4];
          let vs = 1;
          let op: number | null = null;
          let val: any = null;
          // operand
          if (b0 <= 20) {
            op = b0;
            vs = 1;
          }
          if (b0 == 12) {
            op = b0 * 100 + b1;
            vs = 2;
          }
          if (b0 == 19 || b0 == 20) {
            op = b0;
            vs = 2;
          }
          if (21 <= b0 && b0 <= 27) {
            op = b0;
            vs = 1;
          }
          if (b0 == 28) {
            val = bin.readShort(data, offset + 1);
            vs = 3;
          }
          if (29 <= b0 && b0 <= 31) {
            op = b0;
            vs = 1;
          }
          if (32 <= b0 && b0 <= 246) {
            val = b0 - 139;
            vs = 1;
          }
          if (247 <= b0 && b0 <= 250) {
            val = (b0 - 247) * 256 + b1 + 108;
            vs = 2;
          }
          if (251 <= b0 && b0 <= 254) {
            val = -(b0 - 251) * 256 - b1 - 108;
            vs = 2;
          }
          if (b0 == 255) {
            val = bin.readInt(data, offset + 1) / 0xffff;
            vs = 5;
          }

          arr.push(val != null ? val : "o" + op);
          offset += vs;
        }
        return arr;
      },

      readDict: function (data: Uint8Array, offset: number, end: number): any {
        const bin = Typr.B;
        const dict: any = {};
        const carr: any[] = [];

        while (offset < end) {
          const b0 = data[offset];
          const b1 = data[offset + 1];
          const b2 = data[offset + 2];
          const b3 = data[offset + 3];
          const b4 = data[offset + 4];
          let vs = 1;
          let key: string | null = null;
          let val: any = null;

          // operand
          if (b0 == 28) {
            val = bin.readShort(data, offset + 1);
            vs = 3;
          }
          if (b0 == 29) {
            val = bin.readInt(data, offset + 1);
            vs = 5;
          }
          if (32 <= b0 && b0 <= 246) {
            val = b0 - 139;
            vs = 1;
          }
          if (247 <= b0 && b0 <= 250) {
            val = (b0 - 247) * 256 + b1 + 108;
            vs = 2;
          }
          if (251 <= b0 && b0 <= 254) {
            val = -(b0 - 251) * 256 - b1 - 108;
            vs = 2;
          }
          if (b0 == 255) {
            val = bin.readInt(data, offset + 1) / 0xffff;
            vs = 5;
            throw new Error("Unknown number");
          }

          if (b0 == 30) {
            const nibs: number[] = [];
            vs = 1;
            while (true) {
              const b = data[offset + vs];
              vs++;
              const nib0 = b >> 4;
              const nib1 = b & 0xf;
              if (nib0 != 0xf) nibs.push(nib0);
              if (nib1 != 0xf) nibs.push(nib1);
              if (nib1 == 0xf) break;
            }
            let s = "";
            const chars = [
              0,
              1,
              2,
              3,
              4,
              5,
              6,
              7,
              8,
              9,
              ".",
              "e",
              "e-",
              "reserved",
              "-",
              "endOfNumber",
            ];
            for (let i = 0; i < nibs.length; i++) s += chars[nibs[i]];
            val = parseFloat(s);
          }

          if (b0 <= 21) {
            // operator
            const keys = [
              "version",
              "Notice",
              "FullName",
              "FamilyName",
              "Weight",
              "FontBBox",
              "BlueValues",
              "OtherBlues",
              "FamilyBlues",
              "FamilyOtherBlues",
              "StdHW",
              "StdVW",
              "escape",
              "UniqueID",
              "XUID",
              "charset",
              "Encoding",
              "CharStrings",
              "Private",
              "Subrs",
              "defaultWidthX",
              "nominalWidthX",
            ];

            key = keys[b0];
            vs = 1;
            if (b0 == 12) {
              const keys = [
                "Copyright",
                "isFixedPitch",
                "ItalicAngle",
                "UnderlinePosition",
                "UnderlineThickness",
                "PaintType",
                "CharstringType",
                "FontMatrix",
                "StrokeWidth",
                "BlueScale",
                "BlueShift",
                "BlueFuzz",
                "StemSnapH",
                "StemSnapV",
                "ForceBold",
                "",
                "",
                "LanguageGroup",
                "ExpansionFactor",
                "initialRandomSeed",
                "SyntheticBase",
                "PostScript",
                "BaseFontName",
                "BaseFontBlend",
                "",
                "",
                "",
                "",
                "",
                "",
                "ROS",
                "CIDFontVersion",
                "CIDFontRevision",
                "CIDFontType",
                "CIDCount",
                "UIDBase",
                "FDArray",
                "FDSelect",
                "FontName",
              ];
              key = keys[b1];
              vs = 2;
            }
          }

          if (key != null) {
            dict[key] = carr.length == 1 ? carr[0] : carr;
            carr.length = 0;
          } else carr.push(val);

          offset += vs;
        }
        return dict;
      },
    } as CFFTableParser;

    // CMAP Table Parser
    export const cmap: CmapTableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): CmapTable {
        const obj: CmapTable = { tables: [], ids: {}, off: offset };
        data = new Uint8Array(data.buffer, offset, length);
        offset = 0;

        const offset0 = offset;
        const bin = Typr.B;
        const rU = bin.readUshort;
        const cmap = Typr.T.cmap;
        const version = rU(data, offset);
        offset += 2;
        const numTables = rU(data, offset);
        offset += 2;

        const offs: number[] = [];

        for (let i = 0; i < numTables; i++) {
          const platformID = rU(data, offset);
          offset += 2;
          const encodingID = rU(data, offset);
          offset += 2;
          const noffset = bin.readUint(data, offset);
          offset += 4;

          const id = "p" + platformID + "e" + encodingID;

          const tind = offs.indexOf(noffset);

          if (tind == -1) {
            const tind = obj.tables.length;
            const subt: CmapSubtable = { format: 0 };
            offs.push(noffset);
            const format = (subt.format = rU(data, noffset));
            if (format == 0)
              Object.assign(subt, cmap.parse0(data, noffset, subt));
            else if (format == 4)
              Object.assign(subt, cmap.parse4(data, noffset, subt));
            else if (format == 6)
              Object.assign(subt, cmap.parse6(data, noffset, subt));
            else if (format == 12)
              Object.assign(subt, cmap.parse12(data, noffset, subt));
            obj.tables.push(subt);
          }

          if (obj.ids[id] != null)
            console.log("multiple tables for one platform+encoding: " + id);
          obj.ids[id] = tind;
        }
        return obj;
      },

      parse0: function (
        data: Uint8Array,
        offset: number,
        obj: CmapSubtable
      ): CmapSubtable {
        const bin = Typr.B;
        offset += 2;
        const len = bin.readUshort(data, offset);
        offset += 2;
        const lang = bin.readUshort(data, offset);
        offset += 2;
        obj.map = [];
        for (let i = 0; i < len - 6; i++) obj.map!.push(data[offset + i]);
        return obj;
      },

      parse4: function (
        data: Uint8Array,
        offset: number,
        obj: CmapSubtable
      ): CmapSubtable {
        const bin = Typr.B;
        const rU = bin.readUshort;
        const rUs = bin.readUshorts;
        const offset0 = offset;
        offset += 2;
        const length = rU(data, offset);
        offset += 2;
        const language = rU(data, offset);
        offset += 2;
        const segCountX2 = rU(data, offset);
        offset += 2;
        const segCount = segCountX2 >>> 1;
        obj.searchRange = rU(data, offset);
        offset += 2;
        obj.entrySelector = rU(data, offset);
        offset += 2;
        obj.rangeShift = rU(data, offset);
        offset += 2;
        obj.endCount = rUs(data, offset, segCount);
        offset += segCount * 2;
        offset += 2;
        obj.startCount = rUs(data, offset, segCount);
        offset += segCount * 2;
        obj.idDelta = [];
        for (let i = 0; i < segCount; i++) {
          obj.idDelta.push(bin.readShort(data, offset));
          offset += 2;
        }
        obj.idRangeOffset = rUs(data, offset, segCount);
        offset += segCount * 2;
        obj.glyphIdArray = rUs(data, offset, (offset0 + length - offset) >> 1);
        return obj;
      },

      parse6: function (
        data: Uint8Array,
        offset: number,
        obj: CmapSubtable
      ): CmapSubtable {
        const bin = Typr.B;
        const offset0 = offset;
        offset += 2;
        const length = bin.readUshort(data, offset);
        offset += 2;
        const language = bin.readUshort(data, offset);
        offset += 2;
        obj.firstCode = bin.readUshort(data, offset);
        offset += 2;
        const entryCount = bin.readUshort(data, offset);
        offset += 2;
        obj.glyphIdArray = [];
        for (let i = 0; i < entryCount; i++) {
          obj.glyphIdArray!.push(bin.readUshort(data, offset));
          offset += 2;
        }
        return obj;
      },

      parse12: function (
        data: Uint8Array,
        offset: number,
        obj: CmapSubtable
      ): CmapSubtable {
        const bin = Typr.B;
        const rU = bin.readUint;
        const offset0 = offset;
        offset += 4;
        const length = rU(data, offset);
        offset += 4;
        const lang = rU(data, offset);
        offset += 4;
        const nGroups = rU(data, offset) * 3;
        offset += 4;

        const gps = (obj.groups = new Uint32Array(nGroups));

        for (let i = 0; i < nGroups; i += 3) {
          gps[i] = rU(data, offset + (i << 2));
          gps[i + 1] = rU(data, offset + (i << 2) + 4);
          gps[i + 2] = rU(data, offset + (i << 2) + 8);
        }
        return obj;
      },
    } as CmapTableParser;

    // Add basic table parsers for other tables
    export const head: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): HeadTable {
        const bin = Typr.B;
        const obj: HeadTable = {} as HeadTable;
        const tableVersion = bin.readFixed(data, offset);
        offset += 4;

        obj.fontRevision = bin.readFixed(data, offset);
        offset += 4;
        const checkSumAdjustment = bin.readUint(data, offset);
        offset += 4;
        const magicNumber = bin.readUint(data, offset);
        offset += 4;
        obj.flags = bin.readUshort(data, offset);
        offset += 2;
        obj.unitsPerEm = bin.readUshort(data, offset);
        offset += 2;
        obj.created = bin.readUint64(data, offset);
        offset += 8;
        obj.modified = bin.readUint64(data, offset);
        offset += 8;
        obj.xMin = bin.readShort(data, offset);
        offset += 2;
        obj.yMin = bin.readShort(data, offset);
        offset += 2;
        obj.xMax = bin.readShort(data, offset);
        offset += 2;
        obj.yMax = bin.readShort(data, offset);
        offset += 2;
        obj.macStyle = bin.readUshort(data, offset);
        offset += 2;
        obj.lowestRecPPEM = bin.readUshort(data, offset);
        offset += 2;
        obj.fontDirectionHint = bin.readShort(data, offset);
        offset += 2;
        obj.indexToLocFormat = bin.readShort(data, offset);
        offset += 2;
        obj.glyphDataFormat = bin.readShort(data, offset);
        offset += 2;
        return obj;
      },
    } as TableParser;

    export const hhea: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): HheaTable {
        const bin = Typr.B;
        const obj: HheaTable = {} as HheaTable;
        const tableVersion = bin.readFixed(data, offset);
        offset += 4;

        const keys = [
          "ascender",
          "descender",
          "lineGap",
          "advanceWidthMax",
          "minLeftSideBearing",
          "minRightSideBearing",
          "xMaxExtent",
          "caretSlopeRise",
          "caretSlopeRun",
          "caretOffset",
          "res0",
          "res1",
          "res2",
          "res3",
          "metricDataFormat",
          "numberOfHMetrics",
        ];

        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const func =
            key == "advanceWidthMax" || key == "numberOfHMetrics"
              ? bin.readUshort
              : bin.readShort;
          (obj as any)[key] = func(data, offset + i * 2);
        }
        return obj;
      },
    } as TableParser;

    export const maxp: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): MaxpTable {
        const bin = Typr.B;
        const obj: MaxpTable = {} as MaxpTable;

        const ver = bin.readUint(data, offset);
        offset += 4;

        obj.numGlyphs = bin.readUshort(data, offset);
        offset += 2;

        return obj;
      },
    } as TableParser;

    export const hmtx: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number,
        font: FontData
      ): HmtxTable {
        const bin = Typr.B;
        const aWidth: number[] = [];
        const lsBearing: number[] = [];

        const nG = font["maxp"]?.["numGlyphs"] || 0;
        const nH = font["hhea"]?.["numberOfHMetrics"] || 0;
        let aw = 0,
          lsb = 0,
          i = 0;
        while (i < nH) {
          aw = bin.readUshort(data, offset + (i << 2));
          lsb = bin.readShort(data, offset + (i << 2) + 2);
          aWidth.push(aw);
          lsBearing.push(lsb);
          i++;
        }
        while (i < nG) {
          aWidth.push(aw);
          lsBearing.push(lsb);
          i++;
        }

        return { aWidth, lsBearing };
      },
    } as TableParser;

    export const loca: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number,
        font: FontData
      ): LocaTable {
        const bin = Typr.B;
        const obj: LocaTable = [];

        const ver = font["head"]?.["indexToLocFormat"] || 0;
        const len = (font["maxp"]?.["numGlyphs"] || 0) + 1;

        if (ver == 0)
          for (let i = 0; i < len; i++)
            obj.push(bin.readUshort(data, offset + (i << 1)) << 1);
        if (ver == 1)
          for (let i = 0; i < len; i++)
            obj.push(bin.readUint(data, offset + (i << 2)));

        return obj;
      },
    } as TableParser;

    export const glyf: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number,
        font: FontData
      ): GlyfTable {
        const obj: GlyfTable = [];
        const ng = font["maxp"]?.["numGlyphs"] || 0;
        for (let g = 0; g < ng; g++) obj.push(null);
        return obj;
      },

      _parseGlyf: function (font: FontData, g: number): any {
        const bin = Typr.B;
        const data = font["_data"];
        const loca = font["loca"];
        if (!loca) return null;

        if (loca[g] == loca[g + 1]) return null;

        const tableInfo = Typr.findTable(data, "glyf", font["_offset"]);
        if (!tableInfo) return null;
        const offset = tableInfo[0] + loca[g];

        const gl: any = {};

        gl.noc = bin.readShort(data, offset);
        let currentOffset = offset + 2; // number of contours
        gl.xMin = bin.readShort(data, currentOffset);
        currentOffset += 2;
        gl.yMin = bin.readShort(data, currentOffset);
        currentOffset += 2;
        gl.xMax = bin.readShort(data, currentOffset);
        currentOffset += 2;
        gl.yMax = bin.readShort(data, currentOffset);
        currentOffset += 2;

        if (gl.xMin >= gl.xMax || gl.yMin >= gl.yMax) return null;

        if (gl.noc > 0) {
          gl.endPts = [];
          for (let i = 0; i < gl.noc; i++) {
            gl.endPts.push(bin.readUshort(data, currentOffset));
            currentOffset += 2;
          }

          const instructionLength = bin.readUshort(data, currentOffset);
          currentOffset += 2;
          if (data.length - currentOffset < instructionLength) return null;
          gl.instructions = bin.readBytes(
            data,
            currentOffset,
            instructionLength
          );
          currentOffset += instructionLength;

          const crdnum = gl.endPts[gl.noc - 1] + 1;
          gl.flags = [];
          for (let i = 0; i < crdnum; i++) {
            const flag = data[currentOffset];
            currentOffset++;
            gl.flags.push(flag);
            if ((flag & 8) != 0) {
              const rep = data[currentOffset];
              currentOffset++;
              for (let j = 0; j < rep; j++) {
                gl.flags.push(flag);
                i++;
              }
            }
          }
          gl.xs = [];
          for (let i = 0; i < crdnum; i++) {
            const i8 = (gl.flags[i] & 2) != 0;
            const same = (gl.flags[i] & 16) != 0;
            if (i8) {
              gl.xs.push(same ? data[currentOffset] : -data[currentOffset]);
              currentOffset++;
            } else {
              if (same) gl.xs.push(0);
              else {
                gl.xs.push(bin.readShort(data, currentOffset));
                currentOffset += 2;
              }
            }
          }
          gl.ys = [];
          for (let i = 0; i < crdnum; i++) {
            const i8 = (gl.flags[i] & 4) != 0;
            const same = (gl.flags[i] & 32) != 0;
            if (i8) {
              gl.ys.push(same ? data[currentOffset] : -data[currentOffset]);
              currentOffset++;
            } else {
              if (same) gl.ys.push(0);
              else {
                gl.ys.push(bin.readShort(data, currentOffset));
                currentOffset += 2;
              }
            }
          }
          let x = 0;
          let y = 0;
          for (let i = 0; i < crdnum; i++) {
            x += gl.xs[i];
            y += gl.ys[i];
            gl.xs[i] = x;
            gl.ys[i] = y;
          }
        } else {
          const ARG_1_AND_2_ARE_WORDS = 1 << 0;
          const ARGS_ARE_XY_VALUES = 1 << 1;
          const ROUND_XY_TO_GRID = 1 << 2;
          const WE_HAVE_A_SCALE = 1 << 3;
          const RESERVED = 1 << 4;
          const MORE_COMPONENTS = 1 << 5;
          const WE_HAVE_AN_X_AND_Y_SCALE = 1 << 6;
          const WE_HAVE_A_TWO_BY_TWO = 1 << 7;
          const WE_HAVE_INSTRUCTIONS = 1 << 8;
          const USE_MY_METRICS = 1 << 9;
          const OVERLAP_COMPOUND = 1 << 10;
          const SCALED_COMPONENT_OFFSET = 1 << 11;
          const UNSCALED_COMPONENT_OFFSET = 1 << 12;

          gl.parts = [];
          let flags: number;
          do {
            flags = bin.readUshort(data, currentOffset);
            currentOffset += 2;
            const part: any = {
              m: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
              p1: -1,
              p2: -1,
            };
            gl.parts.push(part);
            part.glyphIndex = bin.readUshort(data, currentOffset);
            currentOffset += 2;
            let arg1: number, arg2: number;
            if (flags & ARG_1_AND_2_ARE_WORDS) {
              arg1 = bin.readShort(data, currentOffset);
              currentOffset += 2;
              arg2 = bin.readShort(data, currentOffset);
              currentOffset += 2;
            } else {
              arg1 = bin.readInt8(data, currentOffset);
              currentOffset++;
              arg2 = bin.readInt8(data, currentOffset);
              currentOffset++;
            }

            if (flags & ARGS_ARE_XY_VALUES) {
              part.m.tx = arg1;
              part.m.ty = arg2;
            } else {
              part.p1 = arg1;
              part.p2 = arg2;
            }

            if (flags & WE_HAVE_A_SCALE) {
              part.m.a = part.m.d = bin.readF2dot14(data, currentOffset);
              currentOffset += 2;
            } else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) {
              part.m.a = bin.readF2dot14(data, currentOffset);
              currentOffset += 2;
              part.m.d = bin.readF2dot14(data, currentOffset);
              currentOffset += 2;
            } else if (flags & WE_HAVE_A_TWO_BY_TWO) {
              part.m.a = bin.readF2dot14(data, currentOffset);
              currentOffset += 2;
              part.m.b = bin.readF2dot14(data, currentOffset);
              currentOffset += 2;
              part.m.c = bin.readF2dot14(data, currentOffset);
              currentOffset += 2;
              part.m.d = bin.readF2dot14(data, currentOffset);
              currentOffset += 2;
            }
          } while (flags & MORE_COMPONENTS);
          if (flags & WE_HAVE_INSTRUCTIONS) {
            const numInstr = bin.readUshort(data, currentOffset);
            currentOffset += 2;
            gl.instr = [];
            for (let i = 0; i < numInstr; i++) {
              gl.instr.push(data[currentOffset]);
              currentOffset++;
            }
          }
        }
        return gl;
      },
    } as TableParser & { _parseGlyf: (font: FontData, g: number) => any };

    export const name: NameTableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): any {
        const bin = Typr.B;
        const obj: any = {};
        const format = bin.readUshort(data, offset);
        offset += 2;
        const count = bin.readUshort(data, offset);
        offset += 2;
        const stringOffset = bin.readUshort(data, offset);
        offset += 2;

        const ooo = offset - 6 + stringOffset;

        const names = [
          "copyright",
          "fontFamily",
          "fontSubfamily",
          "ID",
          "fullName",
          "version",
          "postScriptName",
          "trademark",
          "manufacturer",
          "designer",
          "description",
          "urlVendor",
          "urlDesigner",
          "licence",
          "licenceURL",
          "---",
          "typoFamilyName",
          "typoSubfamilyName",
          "compatibleFull",
          "sampleText",
          "postScriptCID",
          "wwsFamilyName",
          "wwsSubfamilyName",
          "lightPalette",
          "darkPalette",
        ];

        const rU = bin.readUshort;

        for (let i = 0; i < count; i++) {
          const platformID = rU(data, offset);
          offset += 2;
          const encodingID = rU(data, offset);
          offset += 2;
          const languageID = rU(data, offset);
          offset += 2;
          const nameID = rU(data, offset);
          offset += 2;
          const slen = rU(data, offset);
          offset += 2;
          const noffset = rU(data, offset);
          offset += 2;

          const soff = ooo + noffset;
          let str: string;
          if (false) {
          } else if (platformID == 0)
            str = bin.readUnicode(data, soff, slen / 2);
          else if (platformID == 3 && encodingID == 0)
            str = bin.readUnicode(data, soff, slen / 2);
          else if (platformID == 1 && encodingID == 25)
            str = bin.readUnicode(data, soff, slen / 2);
          else if (encodingID == 0) str = bin.readASCII(data, soff, slen);
          else if (encodingID == 1) str = bin.readUnicode(data, soff, slen / 2);
          else if (encodingID == 3) str = bin.readUnicode(data, soff, slen / 2);
          else if (encodingID == 4) str = bin.readUnicode(data, soff, slen / 2);
          else if (encodingID == 5) str = bin.readUnicode(data, soff, slen / 2);
          else if (encodingID == 10)
            str = bin.readUnicode(data, soff, slen / 2);
          else if (platformID == 1) {
            str = bin.readASCII(data, soff, slen);
            console.log(
              "reading unknown MAC encoding " + encodingID + " as ASCII"
            );
          } else {
            console.log(
              "unknown encoding " + encodingID + ", platformID: " + platformID
            );
            str = bin.readASCII(data, soff, slen);
          }

          const tid = "p" + platformID + "," + languageID.toString(16);
          if (obj[tid] == null) obj[tid] = {};
          let name = names[nameID];
          if (name == null) name = "_" + nameID;
          obj[tid][name] = str;
          obj[tid]["_lang"] = languageID;
        }

        const out = Typr.T.name.selectOne(obj);
        const ff = "fontFamily";
        if (out[ff] == null)
          for (const p in obj) if (obj[p][ff] != null) out[ff] = obj[p][ff];
        return out;
      },

      selectOne: function (obj: any): any {
        const psn = "postScriptName";

        for (const p in obj)
          if (obj[p][psn] != null && obj[p]["_lang"] == 0x0409) return obj[p]; // United States
        for (const p in obj)
          if (obj[p][psn] != null && obj[p]["_lang"] == 0x0000) return obj[p]; // Universal
        for (const p in obj)
          if (obj[p][psn] != null && obj[p]["_lang"] == 0x0c0c) return obj[p]; // Canada
        for (const p in obj) if (obj[p][psn] != null) return obj[p];

        let out: any;
        for (const p in obj) {
          out = obj[p];
          break;
        }
        console.log("returning name table with languageID " + out._lang);
        if (out[psn] == null && out["ID"] != null) out[psn] = out["ID"];
        return out;
      },
    } as NameTableParser;

    export const OS2: OS2TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): any {
        const bin = Typr.B;
        const ver = bin.readUshort(data, offset);
        offset += 2;

        const OS2 = Typr.T.OS2;

        const obj: any = {};
        if (ver == 0) OS2.version0(data, offset, obj);
        else if (ver == 1) OS2.version1(data, offset, obj);
        else if (ver == 2 || ver == 3 || ver == 4)
          OS2.version2(data, offset, obj);
        else if (ver == 5) OS2.version5(data, offset, obj);
        else throw new Error("unknown OS/2 table version: " + ver);

        return obj;
      },

      version0: function (data: Uint8Array, offset: number, obj: any): number {
        const bin = Typr.B;
        obj["xAvgCharWidth"] = bin.readShort(data, offset);
        offset += 2;
        obj["usWeightClass"] = bin.readUshort(data, offset);
        offset += 2;
        obj["usWidthClass"] = bin.readUshort(data, offset);
        offset += 2;
        obj["fsType"] = bin.readUshort(data, offset);
        offset += 2;
        obj["ySubscriptXSize"] = bin.readShort(data, offset);
        offset += 2;
        obj["ySubscriptYSize"] = bin.readShort(data, offset);
        offset += 2;
        obj["ySubscriptXOffset"] = bin.readShort(data, offset);
        offset += 2;
        obj["ySubscriptYOffset"] = bin.readShort(data, offset);
        offset += 2;
        obj["ySuperscriptXSize"] = bin.readShort(data, offset);
        offset += 2;
        obj["ySuperscriptYSize"] = bin.readShort(data, offset);
        offset += 2;
        obj["ySuperscriptXOffset"] = bin.readShort(data, offset);
        offset += 2;
        obj["ySuperscriptYOffset"] = bin.readShort(data, offset);
        offset += 2;
        obj["yStrikeoutSize"] = bin.readShort(data, offset);
        offset += 2;
        obj["yStrikeoutPosition"] = bin.readShort(data, offset);
        offset += 2;
        obj["sFamilyClass"] = bin.readShort(data, offset);
        offset += 2;
        obj["panose"] = bin.readBytes(data, offset, 10);
        offset += 10;
        obj["ulUnicodeRange1"] = bin.readUint(data, offset);
        offset += 4;
        obj["ulUnicodeRange2"] = bin.readUint(data, offset);
        offset += 4;
        obj["ulUnicodeRange3"] = bin.readUint(data, offset);
        offset += 4;
        obj["ulUnicodeRange4"] = bin.readUint(data, offset);
        offset += 4;
        obj["achVendID"] = bin.readASCII(data, offset, 4);
        offset += 4;
        obj["fsSelection"] = bin.readUshort(data, offset);
        offset += 2;
        obj["usFirstCharIndex"] = bin.readUshort(data, offset);
        offset += 2;
        obj["usLastCharIndex"] = bin.readUshort(data, offset);
        offset += 2;
        obj["sTypoAscender"] = bin.readShort(data, offset);
        offset += 2;
        obj["sTypoDescender"] = bin.readShort(data, offset);
        offset += 2;
        obj["sTypoLineGap"] = bin.readShort(data, offset);
        offset += 2;
        obj["usWinAscent"] = bin.readUshort(data, offset);
        offset += 2;
        obj["usWinDescent"] = bin.readUshort(data, offset);
        offset += 2;
        return offset;
      },

      version1: function (data: Uint8Array, offset: number, obj: any): number {
        const bin = Typr.B;
        offset = Typr.T.OS2.version0(data, offset, obj);

        obj["ulCodePageRange1"] = bin.readUint(data, offset);
        offset += 4;
        obj["ulCodePageRange2"] = bin.readUint(data, offset);
        offset += 4;
        return offset;
      },

      version2: function (data: Uint8Array, offset: number, obj: any): number {
        const bin = Typr.B;
        const rU = bin.readUshort;
        offset = Typr.T.OS2.version1(data, offset, obj);

        obj["sxHeight"] = bin.readShort(data, offset);
        offset += 2;
        obj["sCapHeight"] = bin.readShort(data, offset);
        offset += 2;
        obj["usDefault"] = rU(data, offset);
        offset += 2;
        obj["usBreak"] = rU(data, offset);
        offset += 2;
        obj["usMaxContext"] = rU(data, offset);
        offset += 2;
        return offset;
      },

      version5: function (data: Uint8Array, offset: number, obj: any): number {
        const rU = Typr.B.readUshort;
        offset = Typr.T.OS2.version2(data, offset, obj);

        obj["usLowerOpticalPointSize"] = rU(data, offset);
        offset += 2;
        obj["usUpperOpticalPointSize"] = rU(data, offset);
        offset += 2;
        return offset;
      },
    } as OS2TableParser;

    export const post: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): PostTable {
        const bin = Typr.B;
        const obj: PostTable = {} as PostTable;

        obj.version = bin.readFixed(data, offset);
        offset += 4;
        obj.italicAngle = bin.readFixed(data, offset);
        offset += 4;
        obj.underlinePosition = bin.readShort(data, offset);
        offset += 2;
        obj.underlineThickness = bin.readShort(data, offset);
        offset += 2;

        return obj;
      },
    } as TableParser;
    export const kern: KernTableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number,
        font: FontData
      ): any {
        const bin = Typr.B;
        const kern = Typr.T.kern;

        const version = bin.readUshort(data, offset);
        if (version == 1) return kern.parseV1(data, offset, length, font);
        const nTables = bin.readUshort(data, offset + 2);
        offset += 4;

        const map: any = { glyph1: [], rval: [] };
        for (let i = 0; i < nTables; i++) {
          offset += 2; // skip version
          const length = bin.readUshort(data, offset);
          offset += 2;
          const coverage = bin.readUshort(data, offset);
          offset += 2;
          let format = coverage >>> 8;
          format &= 0xf;
          if (format == 0) offset = kern.readFormat0(data, offset, map);
        }
        return map;
      },

      parseV1: function (
        data: Uint8Array,
        offset: number,
        length: number,
        font: FontData
      ): any {
        const bin = Typr.B;
        const kern = Typr.T.kern;

        const version = bin.readFixed(data, offset); // 0x00010000
        const nTables = bin.readUint(data, offset + 4);
        offset += 8;

        const map: any = { glyph1: [], rval: [] };
        for (let i = 0; i < nTables; i++) {
          const length = bin.readUint(data, offset);
          offset += 4;
          const coverage = bin.readUshort(data, offset);
          offset += 2;
          const tupleIndex = bin.readUshort(data, offset);
          offset += 2;
          const format = coverage & 0xff;
          if (format == 0) offset = kern.readFormat0(data, offset, map);
        }
        return map;
      },

      readFormat0: function (
        data: Uint8Array,
        offset: number,
        map: any
      ): number {
        const bin = Typr.B;
        const rUs = bin.readUshort;
        let pleft = -1;
        const nPairs = rUs(data, offset);
        const searchRange = rUs(data, offset + 2);
        const entrySelector = rUs(data, offset + 4);
        const rangeShift = rUs(data, offset + 6);
        offset += 8;
        for (let j = 0; j < nPairs; j++) {
          const left = rUs(data, offset);
          offset += 2;
          const right = rUs(data, offset);
          offset += 2;
          const value = bin.readShort(data, offset);
          offset += 2;
          if (left != pleft) {
            map.glyph1.push(left);
            map.rval.push({ glyph2: [], vals: [] });
          }
          const rval = map.rval[map.rval.length - 1];
          rval.glyph2.push(right);
          rval.vals.push(value);
          pleft = left;
        }
        return offset;
      },
    } as KernTableParser;
    export const GSUB: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number,
        obj: any
      ): any {
        const bin = Typr.B;
        const rU = bin.readUshort;
        const rI = bin.readUint;

        let off = offset;
        const maj = rU(data, off);
        off += 2;
        const min = rU(data, off);
        off += 2;
        const slO = rU(data, off);
        off += 2;
        const flO = rU(data, off);
        off += 2;
        const llO = rU(data, off);
        off += 2;

        off = offset + flO;

        const fmap: any = {};
        const cnt = rU(data, off);
        off += 2;
        for (let i = 0; i < cnt; i++) {
          const tag = bin.readASCII(data, off, 4);
          off += 4;
          const fof = rU(data, off);
          off += 2;
          fmap[tag] = true;
        }
        return fmap;
      },
    } as TableParser;

    export const CBLC: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): any {
        const bin = Typr.B;
        const ooff = offset;

        const maj = bin.readUshort(data, offset);
        offset += 2;
        const min = bin.readUshort(data, offset);
        offset += 2;

        const numSizes = bin.readUint(data, offset);
        offset += 4;

        const out: any[] = [];
        for (let i = 0; i < numSizes; i++) {
          const off = bin.readUint(data, offset);
          offset += 4;
          const siz = bin.readUint(data, offset);
          offset += 4;
          const num = bin.readUint(data, offset);
          offset += 4;
          offset += 4;

          offset += 2 * 12;

          const sGlyph = bin.readUshort(data, offset);
          offset += 2;
          const eGlyph = bin.readUshort(data, offset);
          offset += 2;

          offset += 4;

          let coff = ooff + off;
          for (let j = 0; j < 3; j++) {
            const fgI = bin.readUshort(data, coff);
            coff += 2;
            const lgI = bin.readUshort(data, coff);
            coff += 2;
            const nxt = bin.readUint(data, coff);
            coff += 4;
            const gcnt = lgI - fgI + 1;

            let ioff = ooff + off + nxt;

            const inF = bin.readUshort(data, ioff);
            ioff += 2;
            if (inF != 1) throw new Error(`Invalid format: ${inF}`);
            const imF = bin.readUshort(data, ioff);
            ioff += 2;
            const imgo = bin.readUint(data, ioff);
            ioff += 4;

            const oarr: number[] = [];
            for (let gi = 0; gi < gcnt; gi++) {
              const sbitO = bin.readUint(data, ioff + gi * 4);
              oarr.push(imgo + sbitO);
            }
            out.push([fgI, lgI, imF, oarr]);
          }
        }
        return out;
      },
    } as TableParser;

    export const CBDT: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): Uint8Array {
        return new Uint8Array(data.buffer, data.byteOffset + offset, length);
      },
    } as TableParser;

    export const SVG: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): any {
        const bin = Typr.B;
        const obj: any = { entries: [], svgs: [] };

        const offset0 = offset;

        const tableVersion = bin.readUshort(data, offset);
        offset += 2;
        const svgDocIndexOffset = bin.readUint(data, offset);
        offset += 4;
        const reserved = bin.readUint(data, offset);
        offset += 4;

        offset = svgDocIndexOffset + offset0;

        const numEntries = bin.readUshort(data, offset);
        offset += 2;

        for (let i = 0; i < numEntries; i++) {
          const startGlyphID = bin.readUshort(data, offset);
          offset += 2;
          const endGlyphID = bin.readUshort(data, offset);
          offset += 2;
          const svgDocOffset = bin.readUint(data, offset);
          offset += 4;
          const svgDocLength = bin.readUint(data, offset);
          offset += 4;

          const sbuf = new Uint8Array(
            data.buffer,
            offset0 + svgDocOffset + svgDocIndexOffset,
            svgDocLength
          );
          // Note: pako inflate not available in TypeScript
          // if (sbuf[0] == 0x1f && sbuf[1] == 0x8b && sbuf[2] == 0x08)
          //   sbuf = pako.inflate(sbuf);
          const svg = bin.readUTF8(sbuf, 0, sbuf.length);

          for (let f = startGlyphID; f <= endGlyphID; f++) {
            obj.entries[f] = obj.svgs.length;
          }
          obj.svgs.push(svg);
        }
        return obj;
      },
    } as TableParser;

    export const colr: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): any {
        const bin = Typr.B;
        const ooff = offset;
        offset += 2;
        const num = bin.readUshort(data, offset);
        offset += 2;

        const boff = bin.readUint(data, offset);
        offset += 4;
        const loff = bin.readUint(data, offset);
        offset += 4;

        const lnum = bin.readUshort(data, offset);
        offset += 2;

        const base: any = {};
        let coff = ooff + boff;
        for (let i = 0; i < num; i++) {
          base["g" + bin.readUshort(data, coff)] = [
            bin.readUshort(data, coff + 2),
            bin.readUshort(data, coff + 4),
          ];
          coff += 6;
        }

        const lays: number[] = [];
        coff = ooff + loff;
        for (let i = 0; i < lnum; i++) {
          lays.push(bin.readUshort(data, coff), bin.readUshort(data, coff + 2));
          coff += 4;
        }
        return [base, lays];
      },
    } as TableParser;

    export const cpal: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number
      ): Uint8Array {
        const bin = Typr.B;
        const ooff = offset;
        const vsn = bin.readUshort(data, offset);
        offset += 2;

        if (vsn == 0) {
          const ets = bin.readUshort(data, offset);
          offset += 2;
          const pts = bin.readUshort(data, offset);
          offset += 2;
          const tot = bin.readUshort(data, offset);
          offset += 2;

          const fst = bin.readUint(data, offset);
          offset += 4;

          return new Uint8Array(data.buffer, ooff + fst, tot * 4);
        } else throw new Error(`Unknown color palette version: ${vsn}`);
      },
    } as TableParser;

    export const sbix: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number,
        obj: any
      ): any {
        const numGlyphs = obj["maxp"]["numGlyphs"];
        const ooff = offset;
        const bin = Typr.B;

        const numStrikes = bin.readUint(data, offset + 4);

        const out: any[] = [];
        for (let si = numStrikes - 1; si < numStrikes; si++) {
          const off = ooff + bin.readUint(data, offset + 8 + si * 4);

          for (let gi = 0; gi < numGlyphs; gi++) {
            const aoff = bin.readUint(data, off + 4 + gi * 4);
            const noff = bin.readUint(data, off + 4 + gi * 4 + 4);
            if (aoff == noff) {
              out[gi] = null;
              continue;
            }
            const go = off + aoff;
            const tag = bin.readASCII(data, go + 4, 4);
            if (tag != "png ") throw new Error(`Invalid tag: ${tag}`);

            out[gi] = new Uint8Array(
              data.buffer,
              data.byteOffset + go + 8,
              noff - aoff - 8
            );
          }
        }
        return out;
      },
    } as TableParser;

    export const fvar: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number,
        obj: any
      ): any {
        const name = obj["name"];
        let off = offset;
        const bin = Typr.B;
        const axes: any[] = [];
        const inst: any[] = [];

        off += 8;
        const acnt = bin.readUshort(data, off);
        off += 2;
        off += 2;
        const icnt = bin.readUshort(data, off);
        off += 2;
        const isiz = bin.readUshort(data, off);
        off += 2;

        for (let i = 0; i < acnt; i++) {
          const tag = bin.readASCII(data, off, 4);
          const min = bin.readFixed(data, off + 4);
          const def = bin.readFixed(data, off + 8);
          const max = bin.readFixed(data, off + 12);
          const flg = bin.readUshort(data, off + 16);
          const nid = bin.readUshort(data, off + 18);
          axes.push([tag, min, def, max, flg, name["_" + nid]]);
          off += 20;
        }
        for (let i = 0; i < icnt; i++) {
          const snid = bin.readUshort(data, off);
          let pnid = null;
          const flg = bin.readUshort(data, off + 2);
          const crd: number[] = [];
          for (let j = 0; j < acnt; j++)
            crd.push(bin.readFixed(data, off + 4 + j * 4));
          off += 4 + acnt * 4;
          if ((isiz & 3) == 2) {
            pnid = bin.readUshort(data, off);
            off += 2;
          }
          inst.push([name["_" + snid], flg, crd, pnid]);
        }

        return [axes, inst];
      },
    } as TableParser;

    export const gvar: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number,
        obj: any
      ): any {
        const EMBEDDED_PEAK_TUPLE = 0x8000;
        const INTERMEDIATE_REGION = 0x4000;
        const PRIVATE_POINT_NUMBERS = 0x2000;
        const DELTAS_ARE_ZERO = 0x80;
        const DELTAS_ARE_WORDS = 0x40;
        const POINTS_ARE_WORDS = 0x80;
        const SHARED_POINT_NUMBERS = 0x8000;

        const bin = Typr.B;

        function readTuple(
          data: Uint8Array,
          o: number,
          acnt: number
        ): number[] {
          const tup: number[] = [];
          for (let j = 0; j < acnt; j++)
            tup.push(bin.readF2dot14(data, o + j * 2));
          return tup;
        }

        function readTupleVarHeader(
          data: Uint8Array,
          off: number,
          vcnt: number,
          acnt: number,
          eoff: number
        ): any[] {
          const out: any[] = [];
          for (let j = 0; j < vcnt; j++) {
            const dsiz = bin.readUshort(data, off);
            off += 2;
            let tind = bin.readUshort(data, off);
            const flag = tind & 0xf000;
            tind = tind & 0xfff;
            off += 2;

            let peak = null;
            let start = null;
            let end = null;
            if (flag & EMBEDDED_PEAK_TUPLE) {
              peak = readTuple(data, off, acnt);
              off += acnt * 2;
            }
            if (flag & INTERMEDIATE_REGION) {
              start = readTuple(data, off, acnt);
              off += acnt * 2;
            }
            if (flag & INTERMEDIATE_REGION) {
              end = readTuple(data, off, acnt);
              off += acnt * 2;
            }
            out.push([dsiz, tind, flag, start, peak, end]);
          }
          return out;
        }

        function readPointNumbers(
          data: Uint8Array,
          off: number,
          gid: number
        ): [number[], number] {
          let cnt = data[off];
          off++;
          if (cnt == 0) return [[], off];
          if (127 < cnt) {
            cnt = ((cnt & 127) << 8) | data[off++];
          }

          const pts: number[] = [];
          let last = 0;
          while (pts.length < cnt) {
            const v = data[off++];
            const wds = (v & POINTS_ARE_WORDS) != 0;
            const vv = (v & 127) + 1;
            for (let i = 0; i < vv; i++) {
              let dif = 0;
              if (wds) {
                dif = bin.readUshort(data, off);
                off += 2;
              } else {
                dif = data[off];
                off++;
              }
              last += dif;
              pts.push(last);
            }
          }
          return [pts, off];
        }

        let off = offset + 4;
        const acnt = bin.readUshort(data, off);
        off += 2;
        const tcnt = bin.readUshort(data, off);
        off += 2;
        const toff = bin.readUint(data, off);
        off += 4;
        const gcnt = bin.readUshort(data, off);
        off += 2;
        const flgs = bin.readUshort(data, off);
        off += 2;

        const goff = bin.readUint(data, off);
        off += 4;

        const offs: number[] = [];
        for (let i = 0; i < gcnt + 1; i++)
          offs.push(bin.readUint(data, off + i * 4));

        const tups: number[][] = [];
        const mins: number[][] = [];
        const maxs: number[][] = [];
        off = offset + toff;
        for (let i = 0; i < tcnt; i++) {
          const peak = readTuple(data, off + i * acnt * 2, acnt);
          const imin: number[] = [];
          const imax: number[] = [];
          tups.push(peak);
          mins.push(imin);
          maxs.push(imax);
          for (let k = 0; k < acnt; k++) {
            imin[k] = Math.min(peak[k], 0);
            imax[k] = Math.max(peak[k], 0);
          }
        }

        const i8 = new Int8Array(data.buffer);

        const tabs: any[] = [];
        for (let i = 0; i < gcnt; i++) {
          off = offset + goff + offs[i];
          let vcnt = bin.readUshort(data, off);
          off += 2;

          const snum = vcnt & SHARED_POINT_NUMBERS;
          vcnt &= 0xfff;
          const soff = bin.readUshort(data, off);
          off += 2;

          const hdr = readTupleVarHeader(
            data,
            off,
            vcnt,
            acnt,
            offset + goff + offs[i + 1]
          );

          const tab: any[] = [];
          tabs.push(tab);
          off = offset + goff + offs[i] + soff;

          let sind: number[] | null = null;
          if (snum) {
            const oo = readPointNumbers(data, off, i);
            sind = oo[0];
            off = oo[1];
          }

          for (let j = 0; j < vcnt; j++) {
            const vr = hdr[j];
            const end = off + vr[0];

            let ind = sind;
            if (vr[2] & PRIVATE_POINT_NUMBERS) {
              const oo = readPointNumbers(data, off, i);
              ind = oo[0];
              off = oo[1];
            }
            const ds: number[] = [];
            while (off < end) {
              const cb = data[off++];
              const cnt = (cb & 0x3f) + 1;
              if (cb & DELTAS_ARE_ZERO) {
                for (let k = 0; k < cnt; k++) ds.push(0);
              } else if (cb & DELTAS_ARE_WORDS) {
                for (let k = 0; k < cnt; k++)
                  ds.push(bin.readShort(data, off + k * 2));
                off += cnt * 2;
              } else {
                for (let k = 0; k < cnt; k++) ds.push(i8[off + k]);
                off += cnt;
              }
            }
            const ti = vr[1];

            const outInd = ind && ind.length * 2 == ds.length ? ind : null;
            tab.push([
              [
                vr[3] ? vr[3] : mins[ti],
                vr[4] ? vr[4] : tups[ti],
                vr[5] ? vr[5] : maxs[ti],
              ],
              ds,
              outInd,
            ]);
          }
        }
        return tabs;
      },
    } as TableParser;

    export const avar: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number,
        obj: any
      ): any {
        let off = offset;
        const bin = Typr.B;
        const out: any[] = [];

        off += 6;
        const acnt = bin.readUshort(data, off);
        off += 2;

        for (let ai = 0; ai < acnt; ai++) {
          const cnt = bin.readUshort(data, off);
          off += 2;
          const poly: number[] = [];
          out.push(poly);
          for (let i = 0; i < cnt; i++) {
            const x = bin.readF2dot14(data, off);
            const y = bin.readF2dot14(data, off + 2);
            off += 4;
            poly.push(x, y);
          }
        }

        return out;
      },
    } as TableParser;

    export const STAT: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number,
        font: FontData
      ): STATTable {
        const bin = Typr.B;
        let off = offset;

        const majorVersion = bin.readUshort(data, off);
        off += 2;
        const minorVersion = bin.readUshort(data, off);
        off += 2;
        const designAxisSize = bin.readUshort(data, off);
        off += 2;
        const designAxisCount = bin.readUshort(data, off);
        off += 2;
        const designAxesOffset = bin.readUint(data, off);
        off += 4;
        const axisValueCount = bin.readUshort(data, off);
        off += 2;
        const axisValueOffsetsOffset = bin.readUint(data, off);
        off += 4;
        let elidedFallbackNameID: number | undefined;
        if (majorVersion > 1 || (majorVersion === 1 && minorVersion >= 1)) {
          elidedFallbackNameID = bin.readUshort(data, off);
          off += 2;
        }

        const name = font.name || {};

        const designAxes: STATAxisRecord[] = [];
        if (designAxisCount > 0) {
          let aoff = offset + designAxesOffset;
          for (let i = 0; i < designAxisCount; i++) {
            const tag = bin.readASCII(data, aoff, 4);
            const axisNameID = bin.readUshort(data, aoff + 4);
            const ordering = bin.readUshort(data, aoff + 6);
            designAxes.push({ tag, name: name["_" + axisNameID], ordering });
            aoff += designAxisSize;
          }
        }

        const valueOffsets: number[] = [];
        if (axisValueCount > 0) {
          const arrBase = offset + axisValueOffsetsOffset;
          let voff = arrBase;
          for (let i = 0; i < axisValueCount; i++) {
            const relOff = bin.readUshort(data, voff);
            valueOffsets.push(arrBase + relOff);
            voff += 2;
          }
        }

        const axisValues: STATAxisValue[] = [];
        for (const rel of valueOffsets) {
          let voff = rel;
          const format = bin.readUshort(data, voff);
          voff += 2;
          if (format === 1) {
            const axisIndex = bin.readUshort(data, voff);
            voff += 2;
            const flags = bin.readUshort(data, voff);
            voff += 2;
            const valueNameID = bin.readUshort(data, voff);
            voff += 2;
            const value = bin.readFixed(data, voff);
            axisValues.push({
              format: 1,
              axisIndex,
              flags,
              name: name["_" + valueNameID],
              value,
            });
          } else if (format === 2) {
            const axisIndex = bin.readUshort(data, voff);
            voff += 2;
            const flags = bin.readUshort(data, voff);
            voff += 2;
            const valueNameID = bin.readUshort(data, voff);
            voff += 2;
            const nominalValue = bin.readFixed(data, voff);
            voff += 4;
            const rangeMinValue = bin.readFixed(data, voff);
            voff += 4;
            const rangeMaxValue = bin.readFixed(data, voff);
            axisValues.push({
              format: 2,
              axisIndex,
              flags,
              name: name["_" + valueNameID],
              nominalValue,
              rangeMinValue,
              rangeMaxValue,
            });
          } else if (format === 3) {
            const axisIndex = bin.readUshort(data, voff);
            voff += 2;
            const flags = bin.readUshort(data, voff);
            voff += 2;
            const valueNameID = bin.readUshort(data, voff);
            voff += 2;
            const value = bin.readFixed(data, voff);
            voff += 4;
            const linkedValue = bin.readFixed(data, voff);
            axisValues.push({
              format: 3,
              axisIndex,
              flags,
              name: name["_" + valueNameID],
              value,
              linkedValue,
            });
          } else if (format === 4) {
            const axisCount = bin.readUshort(data, voff);
            voff += 2;
            const flags = bin.readUshort(data, voff);
            voff += 2;
            const valueNameID = bin.readUshort(data, voff);
            voff += 2;
            const axisValuesArr: { axisIndex: number; value: number }[] = [];
            for (let i = 0; i < axisCount; i++) {
              const axisIndex = bin.readUshort(data, voff);
              const value = bin.readFixed(data, voff + 2);
              voff += 6;
              axisValuesArr.push({ axisIndex, value });
            }
            axisValues.push({
              format: 4,
              flags,
              name: name["_" + valueNameID],
              axisValues: axisValuesArr,
            });
          }
        }

        return {
          majorVersion,
          minorVersion,
          designAxes,
          axisValues,
          elidedFallbackNameID,
        };
      },
    } as TableParser;

    export const HVAR: TableParser = {
      parseTab: function (
        data: Uint8Array,
        offset: number,
        length: number,
        obj: any
      ): any {
        let off = offset;
        const oo = offset;
        const bin = Typr.B;
        const out: any[] = [];

        off += 4;

        const varO = bin.readUint(data, off);
        off += 4;
        const advO = bin.readUint(data, off);
        off += 4;
        const lsbO = bin.readUint(data, off);
        off += 4;
        const rsbO = bin.readUint(data, off);
        off += 4;
        if (lsbO != 0 || rsbO != 0) throw new Error(`Invalid offset: ${lsbO}`);

        off = oo + varO;

        const ioff = off;

        const fmt = bin.readUshort(data, off);
        off += 2;
        if (fmt != 1) throw new Error("Invalid format");
        const vregO = bin.readUint(data, off);
        off += 4;
        const vcnt = bin.readUshort(data, off);
        off += 2;

        const offs: number[] = [];
        for (let i = 0; i < vcnt; i++)
          offs.push(bin.readUint(data, off + i * 4));
        off += vcnt * 4;

        off = ioff + vregO;
        const acnt = bin.readUshort(data, off);
        off += 2;
        const rcnt = bin.readUshort(data, off);
        off += 2;

        const regs: any[] = [];
        for (let i = 0; i < rcnt; i++) {
          const crd: number[][] = [[], [], []];
          regs.push(crd);
          for (let j = 0; j < acnt; j++) {
            crd[0].push(bin.readF2dot14(data, off + 0));
            crd[1].push(bin.readF2dot14(data, off + 2));
            crd[2].push(bin.readF2dot14(data, off + 4));
            off += 6;
          }
        }

        const i8 = new Int8Array(data.buffer);
        const varStore: any[] = [];
        for (let i = 0; i < offs.length; i++) {
          off = oo + varO + offs[i];
          const vdata: any[] = [];
          varStore.push(vdata);
          const icnt = bin.readUshort(data, off);
          off += 2;
          const dcnt = bin.readUshort(data, off);
          off += 2;
          if (dcnt & 0x8000) throw new Error("Invalid delta count");
          const rcnt = bin.readUshort(data, off);
          off += 2;
          const ixs: number[] = [];
          for (let j = 0; j < rcnt; j++)
            ixs.push(bin.readUshort(data, off + j * 2));
          off += rcnt * 2;

          for (let k = 0; k < icnt; k++) {
            const deltaData: number[] = [];
            for (let ri = 0; ri < rcnt; ri++) {
              deltaData.push(ri < dcnt ? bin.readShort(data, off) : i8[off]);
              off += ri < dcnt ? 2 : 1;
            }
            const dd = new Array(regs.length);
            dd.fill(0);
            vdata.push(dd);
            for (let j = 0; j < ixs.length; j++) {
              // Safety check: ensure ixs[j] is within bounds of dd array
              if (ixs[j] < dd.length && j < deltaData.length) {
                dd[ixs[j]] = deltaData[j];
              }
              // If out of bounds, skip this assignment (dd already filled with 0s)
            }
          }
        }

        off = oo + advO;

        const fmt2 = data[off++];
        if (fmt2 != 0) throw new Error("Invalid format");
        const entryFormat = data[off++];

        const mapCount = bin.readUshort(data, off);
        off += 2;

        const INNER_INDEX_BIT_COUNT_MASK = 0x0f;
        const MAP_ENTRY_SIZE_MASK = 0x30;
        const entrySize = ((entryFormat & MAP_ENTRY_SIZE_MASK) >> 4) + 1;

        const dfs: any[] = [];
        for (let i = 0; i < mapCount; i++) {
          let entry = 0;
          if (entrySize == 1) entry = data[off++];
          else {
            entry = bin.readUshort(data, off);
            off += 2;
          }
          const outerIndex =
            entry >> ((entryFormat & INNER_INDEX_BIT_COUNT_MASK) + 1);
          const innerIndex =
            entry &
            ((1 << ((entryFormat & INNER_INDEX_BIT_COUNT_MASK) + 1)) - 1);

          // Safety check: ensure outerIndex and innerIndex are within bounds
          if (
            outerIndex < varStore.length &&
            varStore[outerIndex] &&
            innerIndex < varStore[outerIndex].length
          ) {
            dfs.push(varStore[outerIndex][innerIndex]);
          } else {
            // If indices are out of bounds, push a default value (array of zeros)
            // This maintains the expected structure while handling malformed data gracefully
            const defaultDelta = new Array(regs.length);
            defaultDelta.fill(0);
            dfs.push(defaultDelta);
          }
        }

        return [regs, dfs];
      },
    } as TableParser;
  }
}

export default Typr;
