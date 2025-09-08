import Typr from "../typr";
import { parseFvarTable, type FvarData } from "./fvar";
import { parseFeaturesTable, type FontFeature } from "./features";
import { parseStatTable, type StatData } from "./stat";

/**
 * Parses OpenType font data once and provides access to various table data.
 */
export class Parser {
  private font: any;
  private _fvar?: FvarData;
  private _features?: FontFeature[];
  private _stat?: StatData;
  private _postscriptName?: string;

  constructor(buffer: ArrayBuffer) {
    [this.font] = Typr.parse(buffer);
  }

  /**
   * Returns variation axes and instances from the `fvar` table.
   */
  fvar(): FvarData {
    if (!this._fvar) {
      this._fvar = parseFvarTable(this.font);
    }
    return this._fvar;
  }

  /**
   * Returns OpenType features from the `GSUB` table.
   */
  features(): FontFeature[] {
    if (!this._features) {
      this._features = parseFeaturesTable(this.font);
    }
    return this._features;
  }

  /**
    * Returns STAT axis and combination information.
    */
  stat(): StatData {
    if (!this._stat) {
      this._stat = parseStatTable(this.font);
    }
    return this._stat;
  }

  /**
   * Returns PostScript name from the name table.
   */
  postscriptName(): string | undefined {
    if (this._postscriptName === undefined) {
      this._postscriptName = this.font.name?.postScriptName;
    }
    return this._postscriptName;
  }
}
