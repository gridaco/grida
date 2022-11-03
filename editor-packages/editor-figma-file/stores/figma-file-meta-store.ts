///
/// the file can be very large, which even simply loading the objects from indexed db will take long time (longer than 1 second)
/// for the solution (while using indexed db), we save meta datas on a different strore for listing the files on the ui.
/// the record's meta should match the full record on 'files' table.
///

import { openDB, IDBPDatabase } from "idb";
import type { FileResponse, Canvas, Color } from "@design-sdk/figma-remote-api";
import * as k from "./k";

// #region global db initialization
const __db_pref = { name: "fimga-file-store", version: k.DB_VER };
const __table = "files-meta";

export type FileMetaRecord = {
  readonly key: string;
  readonly lastUsed: Date;
  readonly components: FileResponse["components"];
  readonly styles: FileResponse["styles"];
  readonly lastModified: string;
  readonly document: {
    readonly type: "DOCUMENT";
    readonly children: Array<{
      readonly type: "CANVAS";
      readonly backgroundColor: Color;
      readonly id: string;
      readonly children: Array<{
        id: string;
      }>;
    }>;
  };
  readonly name: string;
  readonly schemaVersion: number;
  readonly thumbnailUrl: string;
  readonly version: string;
};

const db: Promise<IDBPDatabase<FileMetaRecord>> = new Promise((resolve) => {
  // disable on ssr
  if (typeof window === "undefined") {
    return;
  }

  openDB<FileMetaRecord>(__db_pref.name, __db_pref.version, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(__table)) {
        db.createObjectStore(__table, {
          keyPath: "key",
        });
      }
    },
  }).then((_db) => {
    resolve(_db);
  });
});
// #endregion

export class FigmaFileMetaStore {
  constructor() {}

  async all() {
    return await (await db).getAll(__table);
  }

  async upsert(key: string, file: FileResponse) {
    try {
      await (
        await db
      ).put(__table, <FileMetaRecord>{
        ...minimize(file),
        key: key,
        lastUsed: new Date(),
      });
    } catch (e) {}
  }

  async get(key: string): Promise<FileMetaRecord> {
    return await (await db).get(__table, key);
  }

  async clear() {
    (await db).clear(__table);
  }
}

/**
 * minimizes the full api response optimized (minimized) for meta storage
 * @returns
 */
function minimize(
  full: FileResponse
): Omit<FileMetaRecord, "key" | "lastUsed"> {
  return {
    components: full.components,
    styles: full.styles,

    lastModified: full.lastModified,
    document: {
      type: "DOCUMENT",
      children: (full.document.children as Canvas[]).map((canvas) => {
        return {
          type: "CANVAS",
          backgroundColor: canvas.backgroundColor,
          id: canvas.id,
          children: canvas.children.map((child) => {
            return {
              id: child.id,
            };
          }),
        };
      }),
    },
    name: full.name,
    schemaVersion: full.schemaVersion,
    thumbnailUrl: full.thumbnailUrl,
    version: full.version,
  };
}
