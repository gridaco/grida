import { IDBPDatabase, openDB } from "idb";

type ID = string;

/**
 * Simple model storage on indexed db
 */
export abstract class BaseSimpleModelIdbStore<Model, StoreModel> {
  readonly store: string;
  readonly dbname: string;

  /**
   * Must be `1 <= n`
   **/
  readonly dbver: number;
  private _db: IDBPDatabase;
  async db(): Promise<IDBPDatabase> {
    if (this._db) {
      return this._db;
    }
    return await this.prewarm();
  }

  constructor({
    dbname,
    dbver,
    store,
  }: {
    dbname: string;
    dbver: number;
    store: string;
  }) {
    this.dbname = dbname;
    this.dbver = dbver;
    this.store = store;

    // prewarm on initialization - todo: optimize for i/o performance
    this.prewarm();
  }

  async prewarm(): Promise<IDBPDatabase> {
    const __store = this.store;
    this._db = await openDB(this.dbname, this.dbver, {
      upgrade(db) {
        const store = db.createObjectStore(__store, {
          keyPath: "id",
        });
      },
    });
    return this._db;
  }

  /**
   * get (fetch) object @Model from main store
   * @param id
   */
  abstract get(id: ID): Promise<Model>;

  /**
   * add (save) object @Model to main store
   * @param id
   */
  abstract add(record: StoreModel | Model);
}
