import type { SQLOrderBy, SQLPredicate } from "@/types";

export type DataQueryAction =
  | DataQueryPageLimitAction
  | DataQueryPaginateAction
  | DataQueryOrderByAction
  | DataQueryOrderByClearAction
  | DataQueryPredicatesAddAction
  | DataQueryPredicatesUpdateAction
  | DataQueryPredicatesRemoveAction
  | DataQueryPredicatesClearAction;

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

export interface DataQueryOrderByAction {
  type: "data/query/orderby";
  column_id: string;
  data: Omit<SQLOrderBy, "column"> | null;
}

export interface DataQueryOrderByClearAction {
  type: "data/query/orderby/clear";
}

export interface DataQueryPredicatesAddAction {
  type: "data/query/predicates/add";
  predicate: SQLPredicate;
}

export interface DataQueryPredicatesUpdateAction {
  type: "data/query/predicates/update";
  index: number;
  predicate: Partial<SQLPredicate>;
}

export interface DataQueryPredicatesRemoveAction {
  type: "data/query/predicates/remove";
  index: number;
}

export interface DataQueryPredicatesClearAction {
  type: "data/query/predicates/clear";
}
