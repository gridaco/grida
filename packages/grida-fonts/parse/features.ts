import Typr from "../typr";
import { FEATURES } from "../k";

export interface FontFeature {
  tag: string;
  name: string;
  tooltip?: string;
  sampleText?: string;
  glyphs: string[];
  paramLabels?: string[];
  lookupIndices: number[];
}

export function parseFeatures(buffer: ArrayBuffer): FontFeature[] {
  const [font] = Typr.parse(buffer);
  return parseFeaturesTable(font);
}

export function parseFeaturesTable(font: any): FontFeature[] {
  const gsub = font.GSUB as any;
  if (!gsub || !gsub.features) return [];
  const glyphMap = buildGlyphMap(font);
  const lookupGlyphsCache: Record<number, number[]> = {};

  const getLookupGlyphs = (index: number): number[] => {
    if (lookupGlyphsCache[index]) return lookupGlyphsCache[index];
    const glyphs = parseLookupGlyphs(font, index);
    lookupGlyphsCache[index] = glyphs;
    return glyphs;
  };

  return Object.values(gsub.features).map((f: any) => {
    const glyphIds: number[] = (f.lookups || []).flatMap((li: number) =>
      getLookupGlyphs(li)
    );
    const glyphChars = Array.from(
      new Set(glyphIds.map((id) => glyphMap.get(id)).filter(Boolean))
    ) as string[];

    return {
      tag: f.tag,
      name: f.uiName || FEATURES[f.tag]?.name || f.tag,
      tooltip: f.tooltip,
      sampleText: f.sampleText,
      glyphs: glyphChars,
      paramLabels: f.paramLabels,
      lookupIndices: f.lookups || [],
    };
  });
}

function parseLookupGlyphs(font: any, lookupIndex: number): number[] {
  const data: Uint8Array = font._data;
  const bin = Typr.B;
  const gsubTab = Typr.findTable(data, "GSUB", font._offset);
  if (!gsubTab) return [];
  const gsubOffset = gsubTab[0];
  const lookupListOffset = gsubOffset + bin.readUshort(data, gsubOffset + 8);
  const lookupCount = bin.readUshort(data, lookupListOffset);
  if (lookupIndex >= lookupCount) return [];
  const lookupOffset =
    lookupListOffset + bin.readUshort(data, lookupListOffset + 2 + lookupIndex * 2);
  const lookupType = bin.readUshort(data, lookupOffset);
  const subtableCount = bin.readUshort(data, lookupOffset + 4);
  const glyphs: number[] = [];
  for (let i = 0; i < subtableCount; i++) {
    const subOff =
      lookupOffset + bin.readUshort(data, lookupOffset + 6 + i * 2);
    if (lookupType === 1) {
      glyphs.push(...parseSingleSubst(data, subOff));
    } else if (lookupType === 4) {
      glyphs.push(...parseLigatureSubst(data, subOff));
    }
  }
  return glyphs;
}

function parseSingleSubst(data: Uint8Array, offset: number): number[] {
  const bin = Typr.B;
  const format = bin.readUshort(data, offset);
  const covOffset = offset + bin.readUshort(data, offset + 2);
  // The glyphs returned here should represent the original glyphs that are
  // affected by the substitution, not the resulting glyphs after applying the
  // substitution. The coverage table lists the input glyphs for both format 1
  // and format 2 single substitution subtables, so we can simply read it and
  // ignore the replacement values.
  if (format === 1 || format === 2) {
    return readCoverage(data, covOffset);
  }
  return [];
}

function parseLigatureSubst(data: Uint8Array, offset: number): number[] {
  const bin = Typr.B;
  const format = bin.readUshort(data, offset);
  if (format !== 1) return [];
  const ligSetCount = bin.readUshort(data, offset + 4);
  const glyphs: number[] = [];
  for (let i = 0; i < ligSetCount; i++) {
    const ligSetOff = bin.readUshort(data, offset + 6 + i * 2);
    const ligSetPos = offset + ligSetOff;
    const ligCount = bin.readUshort(data, ligSetPos);
    for (let j = 0; j < ligCount; j++) {
      const ligOff = bin.readUshort(data, ligSetPos + 2 + j * 2);
      const ligPos = ligSetPos + ligOff;
      const ligGlyph = bin.readUshort(data, ligPos);
      glyphs.push(ligGlyph);
    }
  }
  return glyphs;
}

function readCoverage(data: Uint8Array, offset: number): number[] {
  const bin = Typr.B;
  const format = bin.readUshort(data, offset);
  if (format === 1) {
    const count = bin.readUshort(data, offset + 2);
    const arr: number[] = [];
    for (let i = 0; i < count; i++) {
      arr.push(bin.readUshort(data, offset + 4 + i * 2));
    }
    return arr;
  } else if (format === 2) {
    const rangeCount = bin.readUshort(data, offset + 2);
    const arr: number[] = [];
    let off = offset + 4;
    for (let i = 0; i < rangeCount; i++) {
      const start = bin.readUshort(data, off);
      const end = bin.readUshort(data, off + 2);
      off += 6;
      for (let g = start; g <= end; g++) arr.push(g);
    }
    return arr;
  }
  return [];
}

function buildGlyphMap(font: any): Map<number, string> {
  const cmap = font.cmap;
  const map = new Map<number, string>();
  if (!cmap?.tables) return map;
  for (const table of cmap.tables) {
    switch (table.format) {
      case 0:
        if (table.map) {
          for (let i = 0; i < table.map.length; i++) {
            const g = table.map[i];
            if (g && !map.has(g)) map.set(g, String.fromCharCode(i));
          }
        }
        break;
      case 4:
        const segCount = table.startCount.length;
        for (let i = 0; i < segCount; i++) {
          const start = table.startCount[i];
          const end = table.endCount[i];
          for (let code = start; code <= end; code++) {
            let glyph;
            if (table.idRangeOffset[i]) {
              const idx =
                table.idRangeOffset[i] / 2 +
                (code - start) +
                i -
                segCount;
              glyph = table.glyphIdArray[idx];
            } else {
              glyph = (code + table.idDelta[i]) & 0xffff;
            }
            if (glyph && !map.has(glyph)) {
              map.set(glyph, String.fromCodePoint(code));
            }
          }
        }
        break;
      case 6:
        if (table.glyphIdArray) {
          for (let i = 0; i < table.glyphIdArray.length; i++) {
            const glyph = table.glyphIdArray[i];
            if (glyph && !map.has(glyph)) {
              map.set(glyph, String.fromCharCode(table.firstCode + i));
            }
          }
        }
        break;
      case 12:
        const gps = table.groups;
        if (gps) {
          for (let i = 0; i < gps.length; i += 3) {
            const startChar = gps[i];
            const endChar = gps[i + 1];
            let startGlyph = gps[i + 2];
            for (let code = startChar; code <= endChar; code++) {
              const glyph = startGlyph + (code - startChar);
              if (glyph && !map.has(glyph)) {
                map.set(glyph, String.fromCodePoint(code));
              }
            }
          }
        }
        break;
    }
  }
  return map;
}

