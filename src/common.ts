import 'isomorphic-unfetch';

import { DataTrait, QueryFetcher, Value } from 'gqless';
import { GraphQLError } from 'graphql';
import { Dispatch, Reducer, useCallback, useRef } from 'react';

/**
 * Create Options needed for hook instances creation
 */
export type CreateOptions<Schema> = {
  /**
   * **endpoint**
   *
   * Endpoint of the GraphQL server
   */
  endpoint: string;
  /**
   * **schema**
   *
   * gqless GraphQL Schema
   */
  schema: Schema;
  /**
   * **headers**
   *
   * Headers added to all hooks fetch calls
   */
  headers?: Record<string, string>;
};

/**
 * GraphQL variables
 */
export type IVariables = Record<string, unknown>;

interface CommonHookOptions<TData, TVariables extends IVariables> {
  /**
   * **fetchPolicy**
   *
   * Fetch policy used for the hook.
   *
   * Based in **Apollo fetchPolicy** behaviour
   * https://www.apollographql.com/docs/react/api/react-apollo/#optionsfetchpolicy
   */
  fetchPolicy?: FetchPolicy;
  /**
   * **onCompleted**
   *
   * Event called on every successful hook call.
   *
   * It first receives the resulting **data** of the hook call
   * and the hooks pool, identified by **hookId** option.
   *
   * (data: Maybe<TData>, hooks: HooksPool) => void
   */
  onCompleted?: (data: Maybe<TData>, hooks: Readonly<HooksPool>) => void;
  /**
   * **onError**
   *
   * Event called on GraphQL error on hook call.
   */
  onError?: (errors: GraphQLError[]) => void;
  /**
   * **fetchTimeout**
   *
   * Fetch timeout time, by default is **10000** ms
   */
  fetchTimeout?: number;
  /**
   * **headers**
   *
   * Headers added to the **fetch** call
   */
  headers?: Headers;
  /**
   * **variables**
   *
   * Variables used in the hook call.
   *
   * Hook automatically called on any variable change
   * in **useQuery**.
   */
  variables?: TVariables;
  /**
   * **hookId**
   *
   * ***Unique*** hook identifier used to add the hook to the ***hooks pool***, received in
   * **onCompleted** event.
   */
  hookId?: string;
}

export interface QueryOptions<TData, TVariables extends IVariables>
  extends CommonHookOptions<TData, TVariables> {
  /**
   * **lazy**
   *
   * Specify **lazy** behaviour of the query.
   *
   * Wait until explicit query call.
   */
  lazy?: boolean;
  /**
   * **pollInterval**
   *
   * Activate and specify milliseconds polling interval of the hook call;
   */
  pollInterval?: number;
  /**
   * **manualCacheRefetch**
   *
   * If this query handles big amount of data, it's good practice
   * in terms of performance to enable this flag and only use the
   * **cacheRefetch** callback when needed.
   */
  manualCacheRefetch?: boolean;
}
export interface MutationOptions<TData, TVariables extends IVariables>
  extends CommonHookOptions<TData, TVariables> {}

type FetchState = 'waiting' | 'loading' | 'error' | 'done';

/**
 * Hook state
 */
export type IState<TData> = {
  /**
   * **fetchState**
   *
   * Fetch state of the hook.
   *
   * 'waiting' | 'loading' | 'error' | 'done'
   */
  fetchState: FetchState;
  /**
   * **errors**
   *
   * GraphQL errors found on the hook call, if any.
   */
  errors?: GraphQLError[];
  /**
   * **called**
   *
   * Boolean helper to know if the query has already
   * been called, specially useful for **lazy queries**
   * and **mutations**.
   */
  called: boolean;
  /**
   * **data**
   *
   * Data expected from the hook
   */
  data: Maybe<TData>;
};

export type IDispatchAction<
  TData,
  ActionType extends string,
  ActionPayload = undefined
> = {
  type: ActionType;
  payload?: ActionPayload;
  stateRef: { current: IState<TData> };
};

/**
 * Fetch policy based in **Apollo fetchPolicy** behaviour
 * https://www.apollographql.com/docs/react/api/react-apollo/#optionsfetchpolicy
 */
export type FetchPolicy =
  | 'cache-first'
  | 'cache-and-network'
  | 'network-only'
  | 'cache-only'
  | 'no-cache';

export type Maybe<T> = T | null | undefined;

type Headers = Record<string, string | number | boolean>;

export type IDispatch<TData> =
  | IDispatchAction<TData, 'loading'>
  | IDispatchAction<TData, 'done', Maybe<TData>>
  | IDispatchAction<TData, 'error', GraphQLError[]>
  | IDispatchAction<TData, 'setData', Maybe<TData>>;

const LazyInitialState: IState<any> = {
  fetchState: 'waiting',
  called: false,
  data: undefined,
};

const EarlyInitialState: IState<any> = {
  fetchState: 'loading',
  called: true,
  data: undefined,
};

export const StateReducerInitialState = <TData>(
  lazy: boolean
): IState<TData> => {
  if (lazy) return LazyInitialState;

  return EarlyInitialState;
};

export type IStateReducer<TData> = Reducer<IState<TData>, IDispatch<TData>>;

export const stringifyIfNeeded = <T>(data: T) => {
  if (data == null) {
    return null;
  } else if (typeof data === 'object') {
    return JSON.stringify(data);
  }
  return data;
};

export const StateReducer = <TData>(
  reducerState: IState<TData>,
  action: IDispatch<TData>
): IState<TData> => {
  switch (action.type) {
    case 'done': {
      if (reducerState.fetchState === 'error') {
        if (
          stringifyIfNeeded(action.payload) !==
          stringifyIfNeeded(reducerState.data)
        ) {
          action.stateRef.current.data = action.payload;
          return { ...reducerState, data: action.payload };
        }
        return reducerState;
      }

      action.stateRef.current.data = action.payload;

      return {
        called: true,
        fetchState: 'done',
        data: action.payload,
      };
    }
    case 'loading': {
      if (reducerState.fetchState === 'loading') return reducerState;

      action.stateRef.current.fetchState = 'loading';

      return {
        called: true,
        fetchState: 'loading',
        data: reducerState.data,
      };
    }
    case 'error': {
      action.stateRef.current.fetchState = 'error';
      return {
        called: true,
        fetchState: 'error',
        data: reducerState.data,
        errors: action.payload,
      };
    }
    case 'setData': {
      action.stateRef.current.data = action.payload;
      return {
        ...reducerState,
        data: action.payload,
      };
    }
    default:
      return reducerState;
  }
};

export const logDevErrors =
  process.env.NODE_ENV !== 'production'
    ? (err: any) => {
        console.error(err);
      }
    : undefined;

export const defaultEmptyObject = {};

export const useFetchCallback = <TData, TVariables extends IVariables>(args: {
  dispatch: Dispatch<IDispatch<TData>>;
  endpoint: string;
  effects: {
    onPreEffect?: () => void;
    onSuccessEffect?: () => void;
    onErrorEffect?: (err: any) => void;
  };
  type: 'query' | 'mutation';
  creationHeaders: Headers | undefined;
  optionsRef: { current: CommonHookOptions<TData, TVariables> };
  stateRef: { current: IState<TData> };
}) => {
  const argsRef = useRef(args);
  argsRef.current = args;

  return useCallback<QueryFetcher>(async (query, variables) => {
    const {
      fetchPolicy,
      headers = defaultEmptyObject,
      onError,
    } = argsRef.current.optionsRef.current;

    switch (fetchPolicy) {
      case 'cache-only': {
        return {
          data: null,
        };
      }
    }

    const {
      dispatch,
      endpoint,
      effects,
      type = 'query',
      creationHeaders = defaultEmptyObject,
      stateRef,
    } = argsRef.current;

    effects.onPreEffect?.();

    if (stateRef.current.fetchState !== 'loading') {
      dispatch({ type: 'loading', stateRef });
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...creationHeaders,
        ...headers,
      },
      body: JSON.stringify({
        query: type !== 'query' ? type + query : query,
        variables,
      }),
      mode: 'cors',
    });

    let json: any;

    try {
      json = await response.json();
    } catch (err) {
      effects.onErrorEffect?.(err);
      throw err;
    }

    if (!response.ok) {
      let errorPayload: GraphQLError[] | undefined;

      if (Array.isArray(json?.errors)) {
        errorPayload = json.errors;
      } else if (Array.isArray(json)) {
        errorPayload = json;
      }

      const errorText = `Network error, received status code ${response.status} ${response.statusText}`;

      effects.onErrorEffect?.(errorPayload || errorText);

      onError?.(errorPayload || []);

      dispatch({
        type: 'error',
        payload: errorPayload || [],
        stateRef,
      });

      throw new Error(errorText);
    }

    if (json?.errors) {
      effects.onErrorEffect?.(json.errors);

      const errorGraphqlError = Array.isArray(json.errors) ? json.errors : [];

      onError?.(errorGraphqlError);

      dispatch({
        type: 'error',
        payload: errorGraphqlError,
        stateRef,
      });
    } else {
      effects.onSuccessEffect?.();
    }

    return json;
  }, []);
};

function concatCacheMap(
  map: Map<Value<DataTrait>, Set<string | number>>,
  ...iterables: Map<Value<DataTrait>, Set<string | number>>[]
) {
  for (const iterable of iterables) {
    for (const item of iterable) {
      map.set(...item);
    }
  }
}

/**
 * Hooks pool of **gqless-hooks**.
 *
 * Hooks are added based on **hookId**
 */
export type HooksPool = Record<string, Hook | undefined>;

export type Hook = {
  /**
   * Generic hook callback of the hook
   */
  callback: <Data = unknown, Variables extends IVariables = IVariables>(args?: {
    variables?: Variables;
    fetchPolicy?: FetchPolicy;
  }) => Promise<Maybe<Data>>;
  /**
   * Hook callback using **cache-and-network** fetchPolicy.
   */
  refetch: <Data = unknown, Variables extends IVariables = IVariables>(args?: {
    variables?: Variables;
  }) => Promise<Maybe<Data>>;
  /**
   * Hook callback using **cache-only** fetchPolicy.
   */
  cacheRefetch: <
    Data = unknown,
    Variables extends IVariables = IVariables
  >(args?: {
    variables?: Variables;
  }) => Promise<Maybe<Data>>;
  /**
   * Current hook state.
   */
  state: Readonly<{ current: Readonly<IState<any>> }>;
};

export const SharedCache = {
  value: undefined as Value<DataTrait> | undefined,

  cacheSubscribers: new Set<() => Promise<void>>(),

  subscribeCache: (fn: () => Promise<void>) => {
    SharedCache.cacheSubscribers.add(fn);
    return () => {
      SharedCache.cacheSubscribers.delete(fn);
    };
  },

  hooksPool: {} as HooksPool,

  subscribeHookPool: (hookId: string, data: Hook) => {
    if (process.env.NODE_ENV !== 'production') {
      if (hookId in SharedCache.hooksPool) {
        console.warn(
          `Duplicated hook id "${hookId}", previous hook overwriten!`
        );
      }
    }
    SharedCache.hooksPool[hookId] = data;
    return () => {
      delete SharedCache.hooksPool[hookId];
    };
  },

  initialCache: (cacheRootValue: Value<DataTrait>) => {
    if (SharedCache.value === undefined) {
      SharedCache.value = cacheRootValue;

      cacheRootValue.onSet(() => {
        if (SharedCache.cacheSubscribers.size) {
          for (const subscriber of SharedCache.cacheSubscribers) {
            subscriber().catch(console.error);
          }
        }
      });
    }

    return SharedCache.value;
  },

  mergeCache: (cacheRootValue: Value<DataTrait>) => {
    if (SharedCache.value) {
      concatCacheMap(SharedCache.value.references, cacheRootValue.references);
      SharedCache.value.data = Object.assign(
        {},
        SharedCache.value.data,
        cacheRootValue.data
      );
    } else {
      SharedCache.value = SharedCache.initialCache(cacheRootValue);
    }
    return SharedCache.value;
  },
};
