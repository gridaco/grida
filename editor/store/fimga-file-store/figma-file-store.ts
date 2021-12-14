import { openDB, IDBPDatabase } from "idb";
import { FileResponse } from "@design-sdk/figma-remote-api";

// #region global db initialization
const __db_pref = { name: "fimga-file-store", version: 1 };
const __pk = "key";
const __table = "files";
export type FileResponseRecord = FileResponse & {
  [__pk]: string;
};

const db: Promise<IDBPDatabase<FileResponseRecord>> = new Promise((resolve) => {
  openDB<FileResponseRecord>(__db_pref.name, __db_pref.version, {
    upgrade(db) {
      db.createObjectStore(__table, {
        keyPath: __pk,
      });
    },
  }).then((_db) => {
    resolve(_db);
  });
});
// #endregion

export class FigmaFilesStore {
  static of = (key: string): FigmaFileStore => {
    return new FigmaFileStore(key);
  };

  static async all() {
    const files = await (await db).getAll(__table);
    return files.map((file) => file as FileResponseRecord);
  }

  static async add(key: string, file: FileResponse) {
    return new FigmaFileStore(key).upsert(file);
  }
}

export class FigmaFileStore {
  constructor(readonly filekey: string) {}

  async upsert(file: FileResponse) {
    try {
      await (
        await db
      ).put(__table, <FileResponseRecord>{ ...file, [__pk]: this.filekey });
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.error(e);
      }
    }
  }

  async get() {
    const rec = await (await db).get(__table, this.filekey);
    return rec;
  }
}
