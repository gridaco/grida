import type { Data } from "@/lib/data";

//
// #region pagination
//
export type DataQueryPaginationIndexDispatcher = (index: number) => void;
export type DataQueryPaginationLimitDispatcher = (limit: number) => void;
export type DataQueryPaginationPrevDispatcher = () => void;
export type DataQueryPaginationNextDispatcher = () => void;
// #endregion pagination

//
// #region orderby
//
export type DataQueryOrderbyAddDispatcher = (
  column: string,
  initial?: Partial<Omit<Data.Query.OrderBy.TOrderBy, "column">>
) => void;
export type DataQueryOrderbyUpdateDispatcher = (
  column: string,
  data: Partial<Omit<Data.Query.OrderBy.TOrderBy, "column">>
) => void;
export type DataQueryOrderbyRemoveDispatcher = (column: string) => void;
export type DataQueryOrderbyRemoveAllDispatcher = () => void;
// #endregion orderby

//
// #region predicates
//
export type DataQueryPredicateAddDispatcher = (
  predicate: Data.Query.Predicate.TPredicate
) => void;
export type DataQueryPredicateUpdateDispatcher = (
  index: number,
  predicate: Partial<Data.Query.Predicate.TPredicate>
) => void;
export type DataQueryPredicateRemoveDispatcher = (index: number) => void;
export type DataQueryPredicateRemoveAllDispatcher = () => void;
// #endregion predicates

// #region textsearch
export type DataQueryTextSearchColumnSetDispatcher = (
  column: string | null
) => void;
export type DataQueryTextSearchQueryDispatcher = (query: string) => void;
export type DataQueryTextSearchClearDispatcher = () => void;
// #endregion textsearch

//
// #region hook interface
//
export interface IDataQueryGlobalConsumer {
  onRefresh: () => void;
}

export interface IDataQueryOrderbyConsumer {
  readonly orderby: Data.Relation.QueryState["q_orderby"];
  readonly isOrderbySet: boolean;
  readonly onOrderbyAdd: DataQueryOrderbyAddDispatcher;
  readonly onOrderbyUpdate: DataQueryOrderbyUpdateDispatcher;
  readonly onOrderbyRemove: DataQueryOrderbyRemoveDispatcher;
  readonly onOrderbyClear: DataQueryOrderbyRemoveAllDispatcher;
  readonly orderbyUsedKeys: string[];
}

export interface IDataQueryPredicatesConsumer {
  predicates: Data.Relation.QueryState["q_predicates"];
  isPredicatesSet: boolean;
  onPredicatesAdd: DataQueryPredicateAddDispatcher;
  onPredicatesUpdate: DataQueryPredicateUpdateDispatcher;
  onPredicatesRemove: DataQueryPredicateRemoveDispatcher;
  onPredicatesClear: DataQueryPredicateRemoveAllDispatcher;
}

export interface IDataQueryPaginationConsumer {
  limit: number;
  page: number;
  minPage: number;
  maxPage: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  onLimit: DataQueryPaginationLimitDispatcher;
  onPaginate: DataQueryPaginationIndexDispatcher;
  onNextPage: DataQueryPaginationNextDispatcher;
  onPrevPage: DataQueryPaginationPrevDispatcher;
}

export interface IDataQueryTextSearchConsumer {
  isTextSearchSet: boolean;
  isTextSearchValid: boolean;
  onTextSearchColumn: DataQueryTextSearchColumnSetDispatcher;
  onTextSearchQuery: DataQueryTextSearchQueryDispatcher;
  onTextSearchClear: DataQueryTextSearchClearDispatcher;
}
// #endregion hook interface
