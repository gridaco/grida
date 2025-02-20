import { openDB, IDBPDatabase } from "idb";
import type { ImageHashMap, IndexedImage, IndexedImageQuery } from "./types";

// todo - add index with filekey.

/**
 * image hash map is a json object per file.
 * we use localstorage to store this.
 */
export const ImageHashmapCache = {
  set: (filekey: string, value: ImageHashMap) => {
    localStorage.setItem(
      `figma-image-hash-map-${filekey}`,
      JSON.stringify(value)
    );
  },
  get: (filekey: string): ImageHashMap => {
    return JSON.parse(localStorage.getItem(`figma-image-hash-map-${filekey}`));
  },
};

// #region global db initialization
const __db_pref = { name: "fimga-image-store", version: 1 };
const __pk = "id";
const __table = "images";

export const db: Promise<IDBPDatabase<IndexedImage>> = new Promise(
  (resolve) => {
    // disable on ssr
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }

    openDB<IndexedImage>(__db_pref.name, __db_pref.version, {
      upgrade(db) {
        const store = db.createObjectStore(__table, {
          keyPath: __pk,
        });
      },
    }).then((_db) => {
      resolve(_db);
    });
  }
);
// #endregion

export class FigmaNodeImageStore {
  constructor(readonly filekey: string) {}
  static of = (filekey: string): FigmaNodeImageStore => {
    return new FigmaNodeImageStore(filekey);
  };

  key(id: string) {
    return this.filekey + "/" + id;
  }

  static async all() {
    const files = await (await db).getAll(__table);
    return files.map((file) => file as IndexedImage);
  }

  static async add(key: string, file: IndexedImage) {
    return new FigmaNodeImageStore(key).upsert(file);
  }

  async upsert(image: IndexedImage) {
    try {
      await (
        await db
      ).put(__table, <IndexedImage>{
        ...image,
        [__pk]: this.key(image.id),
      });
    } catch (e) {}
  }

  async get(query: IndexedImageQuery): Promise<IndexedImage> {
    const rec = await (await db).get(__table, this.key(query.id));
    return rec;
  }
}
