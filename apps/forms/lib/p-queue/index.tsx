"use client";
import assert from "assert";
import PQueue from "p-queue";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import BatchQueue from "./batch";

///
/// [Queue Provider]
/// Queue Provider is a generic component you can use when dealing with promise based queue handling.
///
/// This is useful on certain scenarios, like,...
/// E.g. you may want to request a image signed url for displaying in browser, but as data size grows, doing this so in a single query can be extremely slow.
/// with Queue Provider you can throttle load the images that is displayed in current virtuallized view then resolve, then display.
///
/// mode configuration
/// - simple mode
///   - on simple mode, the `concurrency` means number of request handled within the period.
/// - batch mode
///   - on batch mode, the `concurrency` means the number of batch request handled within the period.
///   - plus, the `size` means the max size of the array that each batch (request) will have.
///   - when using batch mode, you need to provide a resolver that takes a T[] as input. ( and your endpoint as well if its a server request )
///

const __P_QUEUE_FALLBACK = new PQueue();

// #region generic types
interface Identifiable {
  [key: string]: any;
}

type PQResolverResult<T, E = any> = {
  data: T | null;
  error?: E | null;
};

type PQResult<T, E> = PQResolverResult<T, E> & {
  ok: boolean;
};

type TaskPayload<P> = P;

type PQSingleResolver<T, P> = (
  task: TaskPayload<P>
) => Promise<PQResolverResult<T>>;

type PQBatchResolver<T, P> = (
  ...task: TaskPayload<P>[]
) => Promise<PQResolverResult<T[]>>;

type PQConfig = {
  /**
   * The maximum size of the resolved data saved within the memory. set falsy (0 | -1 | false | null) for no limit.
   * This is to prevent memory leak when handling with huge queue that will be keep being triggered.
   */
  // max_store_size: number | null | false;
};
// #endregion generic types

// #region state context

interface PQResolverState<T extends Identifiable, P extends Identifiable> {
  batch: BatchQueue<P, T, any> | null;
  resolver: PQBatchResolver<T, P> | PQSingleResolver<T, P>;
  queue: PQueue;
}

const PQueueResolverContext = createContext<PQResolverState<any, any> | null>(
  null
);

type PQError = any;

interface PQState<T, P, E> {
  config: PQConfig;
  store: PQResult<T, E | PQError>[];
  tasks: TaskPayload<P>[];
}

const PQueueContext = createContext<PQState<any, any, any> | null>(null);

function initstate(config: PQConfig): PQState<any, any, any> {
  return {
    config,
    store: [],
    tasks: [],
  };
}

type Dispatcher = (action: PQueueAction) => void;
const __noop = () => {};
const PQueueDispatchContext = createContext<Dispatcher>(__noop);

// #endregion state context

// #region actions
type PQueueAction =
  | PQueueAddAction
  | PQueueTaskStartAction
  | PQueueTaskResultAction
  | PQueueClearAction;

type PQueueTaskStartAction = {
  type: "start";
  task: any;
};
type PQueueTaskResultAction = {
  type: "result";
  result: PQResolverResult<any, any>;
};
type PQueueAddAction = { type: "add"; task: any };
type PQueueClearAction = { type: "clear" };
// #endregion actions

// #region reducer / provider
function reducer(
  state: PQState<any, any, any>,
  action: PQueueAction
): PQState<any, any, any> {
  switch (action.type) {
    case "add": {
      return {
        ...state,
        tasks: [...state.tasks, action.task],
      };
    }
    case "start": {
      break;
    }
    case "result": {
      const { result } = action;
      const { error } = result;
      return {
        ...state,
        store: [...state.store, { ...result, ok: error ? true : false }],
      };
    }
    case "clear":
      return {
        ...state,
        store: [],
        tasks: [],
      };
  }
  return state;
}

type TResolverByBatch<B, T, P> = B extends true
  ? PQBatchResolver<T, P>
  : PQSingleResolver<T, P>;

type QueueProviderProps<T, P> = {
  identifier: keyof T;
  config: PQConfig;
  queue?: PQueue;
} & (
  | {
      /**
       * batch size
       */
      batch: number;
      /**
       * throttle time in ms
       */
      throttle: number;
      resolver: TResolverByBatch<true, T, P>;
    }
  | {
      batch?: null | false;
      throttle?: null | false;
      resolver: TResolverByBatch<false, T, P>;
    }
);

function QueueProvider<T extends Identifiable, P extends Identifiable>({
  config,
  resolver,
  batch,
  throttle,
  queue,
  identifier,
  children,
}: React.PropsWithChildren<QueueProviderProps<T, P>>) {
  const [state, dispatch] = useReducer(reducer, initstate(config));

  const batchqueue = useMemo(() => {
    if (!batch) return null;
    return new BatchQueue<P, T, any>({
      batchSize: batch,
      throttleTime: throttle,
      identifier: identifier,
      resolver: async (tasks) => {
        // This is how you process the batched tasks using the provided resolver
        const results = await resolver(...tasks);

        // Dispatch results to update state
        results.data?.forEach((result, index) => {
          const task = tasks[index];
          dispatch({
            type: "result",
            result: { data: result, error: results.error },
          });
        });

        if (!results.data) {
          throw results.error;
        }

        return results.data;
      },
    });
  }, [batch, resolver, throttle]);

  useEffect(() => {
    return () => {
      batchqueue?.flush();
    };
  }, [batchqueue]);

  return (
    <PQueueResolverContext.Provider
      value={{
        resolver: resolver,
        queue: queue || __P_QUEUE_FALLBACK,
        batch: batchqueue,
      }}
    >
      <PQueueContext.Provider value={state}>
        <PQueueDispatchContext.Provider value={dispatch}>
          {children}
        </PQueueDispatchContext.Provider>
      </PQueueContext.Provider>
    </PQueueResolverContext.Provider>
  );
}
// #endregion reducer / provider

// #region hook

function __useDispatch() {
  const dispatch = useContext(PQueueDispatchContext);
  if (!dispatch) throw new Error("QueueProvider not provided");
  return dispatch;
}

function __useResolver() {
  const context = useContext(PQueueResolverContext);
  if (!context) throw new Error("QueueProvider not provided");
  return [context.resolver, context.queue, { batch: context.batch }] as const;
}

type PQAddDispatcher<T, P> = (task: P) => Promise<PQResolverResult<T>>;
type PQClearDispatcher = () => void;

type UseQueueReturnType<T, P> = {
  add: PQAddDispatcher<T, P>;
  clear: PQClearDispatcher;
};
// #endregion hook

function useQueueStore<T, P>(): PQResolverResult<T, any>[] {
  const state = useContext(PQueueContext);
  if (!state) throw new Error("QueueProvider not provided");
  const { store } = state;
  return store;
}

function useQueue<T, P>(): UseQueueReturnType<T, P> {
  const dispatch = __useDispatch();
  const [resolver, queue, config] = __useResolver();
  const state = useContext(PQueueContext);
  if (!state) throw new Error("QueueProvider not provided");

  const { batch } = config;

  const onAdd: PQAddDispatcher<T, P> = useCallback(
    async (task: P) => {
      if (batch) {
        // If batch mode is enabled, add tasks to the BatchQueue
        return batch.addTask(task);
      } else {
        // If batch mode is not enabled, use p-queue
        try {
          const res = await queue.add(() => resolver(task));
          assert(res);
          dispatch({ type: "result", result: res });
          return res;
        } catch (e) {
          return {
            data: null,
            error: e,
          };
        }
      }
    },
    [batch, dispatch, resolver, queue]
  );

  const onClear: PQClearDispatcher = useCallback(() => {
    dispatch({ type: "clear" });
    queue.clear();
  }, [dispatch, queue]);

  return useMemo(
    () => ({
      add: onAdd,
      clear: onClear,
    }),
    [onAdd, onClear]
  );
}

export default QueueProvider;
export { useQueue, useQueueStore };
