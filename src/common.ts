import 'isomorphic-unfetch';

import { QueryFetcher } from 'gqless';
import { GraphQLError } from 'graphql';
import { Dispatch, Reducer, useCallback, useRef } from 'react';
import { QueryFn } from 'useQuery';

/**
 * Serializable headers
 */
export type Headers = Record<string, string | number | boolean>;

/**
 * Possible fetch states
 */
export type FetchState = 'waiting' | 'loading' | 'error' | 'done';

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

/**
 * Possible missing type
 */
export type Maybe<T> = T | null | undefined;

/**
 * Create Options needed for hook instances creation
 */
export interface CreateOptions<Schema> {
  /**
   * Endpoint of the GraphQL server
   */
  endpoint: string;
  /**
   * gqless GraphQL Schema
   */
  schema: Schema;
  /**
   * Headers added to all hooks fetch calls
   */
  creationHeaders?: Headers;
}

/**
 * GraphQL variables
 */
export type IVariables = Record<string, unknown>;

export interface CommonHookOptions<TData, TVariables extends IVariables> {
  /**
   * Event called on every successful hook call. (except "cache-only" calls)
   *
   * It first receives the resulting **data** of the hook call
   * and the hooks pool, identified by **hookId** option.
   *
   * (data: Maybe<TData>, hooks: HooksPool) => void
   */
  onCompleted?: (data: Maybe<TData>, hooks: Readonly<HooksPool>) => void;
  /**
   * Event called on GraphQL error on hook call.
   */
  onError?: (errors: GraphQLError[]) => void;
  /**
   * Fetch timeout time, by default it's **10000** ms
   */
  fetchTimeout?: number;
  /**
   * Headers added to the **fetch** call
   */
  headers?: Headers;
  /**
   * Variables used in the hook call.
   *
   * Hook automatically called on any variable change
   * in **useQuery**.
   */
  variables?: TVariables;
  /**
   * ***Unique*** hook identifier used to add the hook to the ***hooks pool*** received in
   * **onCompleted** event.
   */
  hookId?: string;
}

/**
 * Hook state
 */
export interface IState<TData> {
  /**
   * Fetch state of the hook.
   *
   * 'waiting' | 'loading' | 'error' | 'done'
   */
  fetchState: FetchState;
  /**
   * GraphQL errors found on the hook call, if any.
   */
  errors?: GraphQLError[];
  /**
   * Boolean helper to know if the query has already
   * been called, specially useful for **lazy queries**
   * and **mutations**.
   */
  called: boolean;
  /**
   * Data expected from the hook
   */
  data: Maybe<TData>;
}

export interface IDispatchAction<
  TData,
  ActionType extends string,
  ActionPayload = undefined
> {
  type: ActionType;
  payload?: ActionPayload;
  stateRef: { current: IState<TData> };
}

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
  if (lazy) return { ...LazyInitialState };

  return { ...EarlyInitialState };
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
  optionsRef: {
    current: CommonHookOptions<TData, TVariables> & {
      fetchPolicy?: FetchPolicy;
    };
  };
  stateRef: { current: IState<TData> };
}) => {
  const argsRef = useRef(args);
  argsRef.current = args;

  return useCallback<QueryFetcher>(async (query, variables) => {
    const {
      headers = defaultEmptyObject,
      onError,
      fetchPolicy,
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

/**
 * Hooks pool of **gqless-hooks**.
 *
 * Hooks are added based on **hookId**
 */
export type HooksPool = Record<string, Hook | undefined>;

/**
 * Hook data inside the Hooks Pool
 */
export interface Hook {
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
}

export type CacheSubscribeFn = (data: any) => Promise<void>;

export type SubscriberHookFn = {
  fn: QueryFn<any, any, any>;
  variables: string;
};

export const SharedCache = {
  cacheData: new Map() as Map<QueryFn<any, any, any>, Record<string, any>>,
  cacheSubscribers: new Map() as Map<
    QueryFn<any, any, any>,
    Record<string, Set<CacheSubscribeFn>>
  >,

  subscribeCache: (key: SubscriberHookFn, fn: CacheSubscribeFn) => {
    let keySubscribers = SharedCache.cacheSubscribers.get(key.fn) as Record<
      string,
      Set<CacheSubscribeFn>
    >;

    if (!keySubscribers) {
      keySubscribers = { [key.variables]: new Set() };
      SharedCache.cacheSubscribers.set(key.fn, keySubscribers);
    }

    if (key.variables in keySubscribers) {
      keySubscribers[key.variables].add(fn);
    } else {
      const newVariablesSet = (keySubscribers[key.variables] = new Set());
      newVariablesSet.add(fn);
    }

    return () => {
      keySubscribers[key.variables].delete(fn);
      if (keySubscribers[key.variables].size === 0) {
        delete keySubscribers[key.variables];
      }
      if (Object.keys(keySubscribers).length === 0) {
        SharedCache.cacheSubscribers.delete(key.fn);
      }
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

  cacheSet: (key: SubscriberHookFn, data: any, fnSetter: CacheSubscribeFn) => {
    const cacheVariablesObj = SharedCache.cacheData.get(key.fn);

    if (cacheVariablesObj) {
      cacheVariablesObj[key.variables] = data;
    } else {
      SharedCache.cacheData.set(key.fn, { [key.variables]: data });
    }

    const cacheSubscribers = SharedCache.cacheSubscribers.get(key.fn)?.[
      key.variables
    ];

    if (cacheSubscribers) {
      for (const subscriber of cacheSubscribers) {
        if (subscriber !== fnSetter) {
          subscriber(data);
        }
      }
    }
  },
};
