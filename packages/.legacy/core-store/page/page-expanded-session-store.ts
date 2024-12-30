///
/// expanded / collapsed data of the page is only persistent in the session store.
/// when browser is closed, or reopened, the expanded state is lost.
///

import { PageId } from "@core/model";

/**
 * expanded / collapsed data of the page is only persistent in the session store.
 * when browser is closed, or reopened, the expanded state is lost.
 *
 * provides simple get / set of expansion data linked by page id.
 */
export class PageExpansionSessionStore {
  set(page: PageId, expaned: boolean) {
    window.sessionStorage.setItem(_makeid(page), JSON.stringify(expaned));
  }

  get(page: PageId): boolean {
    const _stored = window.sessionStorage.getItem(_makeid(page));
    return _stored !== undefined ? JSON.parse(_stored) : false;
  }
}

function _makeid(id: PageId) {
  return `page-is-collapsed-${id}`;
}
