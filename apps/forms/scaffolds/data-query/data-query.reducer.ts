import produce from "immer";
import type { DataQueryState } from "./data-query.provider";
import type {
  DataQueryAction,
  DataQueryPageLimitAction,
  DataQueryPaginateAction,
  DataQueryOrderByAction,
  DataQueryOrderByClearAction,
  DataQueryPredicatesAddAction,
  DataQueryPredicatesUpdateAction,
  DataQueryPredicatesClearAction,
  DataQueryPredicatesRemoveAction,
} from "./data-query.action";

export default function reducer(
  state: DataQueryState,
  action: DataQueryAction
): DataQueryState {
  switch (action.type) {
    case "data/query/page-limit": {
      const { limit } = <DataQueryPageLimitAction>action;
      return produce(state, (draft) => {
        draft.q_page_limit = limit;

        // reset the pagination
        draft.q_page_index = 0;
      });
    }
    case "data/query/page-index": {
      const { index } = <DataQueryPaginateAction>action;
      return produce(state, (draft) => {
        draft.q_page_index = index;
      });
    }
    case "data/query/orderby": {
      const { column_id, data } = <DataQueryOrderByAction>action;
      return produce(state, (draft) => {
        if (data === null) {
          delete draft.q_orderby[column_id];
          return;
        }

        draft.q_orderby[column_id] = {
          column: column_id,
          ...data,
        };
      });
    }
    case "data/query/orderby/clear": {
      const {} = <DataQueryOrderByClearAction>action;
      return produce(state, (draft) => {
        draft.q_orderby = {};
      });
    }
    case "data/query/predicates/add": {
      const { predicate } = <DataQueryPredicatesAddAction>action;
      return produce(state, (draft) => {
        draft.q_predicates.push(predicate);
      });
    }
    case "data/query/predicates/update": {
      const { index, predicate } = <DataQueryPredicatesUpdateAction>action;
      return produce(state, (draft) => {
        const prev = draft.q_predicates[index];
        draft.q_predicates[index] = {
          ...prev,
          ...predicate,
        };
      });
    }
    case "data/query/predicates/remove": {
      const { index } = <DataQueryPredicatesRemoveAction>action;
      return produce(state, (draft) => {
        draft.q_predicates.splice(index, 1);
      });
    }
    case "data/query/predicates/clear": {
      const {} = <DataQueryPredicatesClearAction>action;
      return produce(state, (draft) => {
        draft.q_predicates = [];
      });
    }
  }

  return state;
}
