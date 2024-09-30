import produce from "immer";
import type { DataQueryState } from "./data-query.provider";
import type {
  DataQueryAction,
  DataQueryPageLimitAction,
  DataQueryPaginateAction,
  DataQueryOrderByUpsertAction,
  DataQueryOrderByClearAction,
  DataQueryPredicatesAddAction,
  DataQueryPredicatesUpdateAction,
  DataQueryPredicatesClearAction,
  DataQueryPredicatesRemoveAction,
  DataQueryOrderByRemoveAction,
  DataQueryTextSearchQeuryAction,
  DataQueryTextSearchClearAction,
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
      const { column_id, data } = <DataQueryOrderByUpsertAction>action;
      return produce(state, (draft) => {
        if (data === null) {
          delete draft.q_orderby[column_id];
          return;
        }

        draft.q_orderby[column_id] = {
          column: column_id,
          ascending: data.ascending ?? true,
          nullsFirst: data.nullsFirst,
        };
      });
    }
    case "data/query/orderby/remove": {
      const { column_id } = <DataQueryOrderByRemoveAction>action;
      return produce(state, (draft) => {
        delete draft.q_orderby[column_id];
        return;
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
    case "data/query/textsearch/query": {
      const { query } = <DataQueryTextSearchQeuryAction>action;
      return produce(state, (draft) => {
        if (draft.q_text_search) {
          draft.q_text_search.query = query;
        } else {
          // initialize with default config (this shall not happen)
          draft.q_text_search = {
            column: "",
            query: query,
            type: "plain",
          };
        }
      });
    }
    case "data/query/textsearch/clear": {
      const {} = <DataQueryTextSearchClearAction>action;
      return produce(state, (draft) => {
        draft.q_text_search = null;
      });
    }
  }

  return state;
}
