import { Page } from "@core/model";
import { openDB, deleteDB, wrap, unwrap } from "idb";
import { BaseSimpleModelIdbStore } from "../_store/base-store";

/**
 * pages table name
 **/
const STORE_PAGES = "pages";
const DB_PAGE_N = "page-store";

/**
 * keep this 1 until production release.
 * use the "delete database"  from developer tools instead of incrementing dbver.
 **/
const DB_PAGE_V = 1;

/**
 *
 **/
export class PageStore extends BaseSimpleModelIdbStore<Page> {
  constructor() {
    super({
      dbname: DB_PAGE_N,
      dbver: DB_PAGE_V,
      store: STORE_PAGES,
    });
  }

  async get(id: string): Promise<Page> {
    const page = await (await this.db()).get(STORE_PAGES, id);
    return page;
  }

  async add(page: Page) {
    await (await this.db()).add(STORE_PAGES, page);
  }

  async getAll(): Promise<Page[]> {
    return await (await this.db()).getAll(STORE_PAGES);
  }
}
