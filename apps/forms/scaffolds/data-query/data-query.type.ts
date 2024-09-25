import type { SQLOrderBy, SQLPredicate } from "@/types";

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
  initial?: Partial<Omit<SQLOrderBy, "column"> | null>
) => void;
export type DataQueryOrderbyUpdateDispatcher = (
  column: string,
  data: Partial<Omit<SQLOrderBy, "column">>
) => void;
export type DataQueryOrderbyRemoveDispatcher = (column: string) => void;
export type DataQueryOrderbyRemoveAllDispatcher = () => void;
// #endregion orderby

//
// #region predicates
//
export type DataQueryPredicateAddDispatcher = (predicate: SQLPredicate) => void;
export type DataQueryPredicateUpdateDispatcher = (
  index: number,
  predicate: Partial<SQLPredicate>
) => void;
export type DataQueryPredicateRemoveDispatcher = (index: number) => void;
export type DataQueryPredicateRemoveAllDispatcher = () => void;
// #endregion predicates
