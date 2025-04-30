import type { Data } from "@/lib/data";

export type DataQueryAction =
  | DataQueryRefreshAction
  | DataQueryPageLimitAction
  | DataQueryPaginateAction
  | DataQueryOrderByUpsertAction
  | DataQueryOrderByRemoveAction
  | DataQueryOrderByClearAction
  | DataQueryPredicatesAddAction
  | DataQueryPredicatesUpdateAction
  | DataQueryPredicatesRemoveAction
  | DataQueryPredicatesClearAction
  | DataQueryTextSearchSetAction
  | DataQueryTextSearchColumnAction
  | DataQueryTextSearchQeuryAction
  | DataQueryTextSearchClearAction;

// #region global
export interface DataQueryRefreshAction {
  type: "data/query/refresh";
}
// #endregion global

// #region pagination
export interface DataQueryPageLimitAction {
  type: "data/query/page-limit";
  limit: number;
}

export interface DataQueryPaginateAction {
  type: "data/query/page-index";
  index: number;
}
// #endregion pagination

export interface DataQueryOrderByUpsertAction {
  type: "data/query/orderby";
  column_id: string;
  data: Omit<Data.Query.OrderBy.SQLOrderBy, "column">;
}

export interface DataQueryOrderByRemoveAction {
  type: "data/query/orderby/remove";
  column_id: string;
}

export interface DataQueryOrderByClearAction {
  type: "data/query/orderby/clear";
}

export interface DataQueryPredicatesAddAction {
  type: "data/query/predicates/add";
  predicate: Data.Query.Predicate.ExtendedPredicate;
}

export interface DataQueryPredicatesUpdateAction {
  type: "data/query/predicates/update";
  index: number;
  predicate: Partial<Data.Query.Predicate.ExtendedPredicate>;
}

export interface DataQueryPredicatesRemoveAction {
  type: "data/query/predicates/remove";
  index: number;
}

export interface DataQueryPredicatesClearAction {
  type: "data/query/predicates/clear";
}

export interface DataQueryTextSearchSetAction {
  type: "data/query/textsearch";
  column: string | null;
  query: string;
  config?: {
    type: Data.Query.Predicate.TextSearchQuery["type"];
  };
}

export interface DataQueryTextSearchColumnAction {
  type: "data/query/textsearch/column";
  column: string | null;
}

export interface DataQueryTextSearchQeuryAction {
  type: "data/query/textsearch/query";
  query: string;
}

export interface DataQueryTextSearchClearAction {
  type: "data/query/textsearch/clear";
}
