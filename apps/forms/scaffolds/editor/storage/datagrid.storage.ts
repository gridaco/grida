import { SQLOrderBy, SQLPredicate } from "@/types";

export namespace DataGridLocalPreferencesStorage {
  const key = (view_id: string) => `editor/data-grid/preferences/${view_id}`;

  /**
   * The json spec version
   * change this when the json spec changes
   * local data will be lost when this changes
   */
  const version = "0";
  //
  export type DataGridLocalPreference = {
    predicates?: Array<SQLPredicate> | null;
    orderby?: { [key: string]: SQLOrderBy } | null;
  };

  //
  type DataGridLocalPreferenceWithVersion = DataGridLocalPreference & {
    /**
     * updated timestamp
     */
    t: number;
    version: string;
  };

  export function get(
    view_id: string
  ): (DataGridLocalPreference & { t: number }) | null {
    const pl = localStorage.getItem(key(view_id));
    if (pl === null) return null;
    const data: DataGridLocalPreferenceWithVersion = JSON.parse(pl);
    if (data.version !== version) return null;
    return data;
  }

  export function set(view_id: string, pref: DataGridLocalPreference | null) {
    const k = key(view_id);
    if (pref === null) {
      localStorage.removeItem(k);
      return;
    }
    localStorage.setItem(
      k,
      JSON.stringify({
        ...pref,
        version,
        t: Date.now(),
      })
    );
  }

  export function clear(view_id: string) {
    localStorage.removeItem(key(view_id));
  }
}
