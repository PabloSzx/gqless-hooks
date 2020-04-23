import 'isomorphic-unfetch';

import { QueryFetcher } from 'gqless';
import { GraphQLError } from 'graphql';
import { Dispatch, Reducer, useCallback, useEffect, useRef } from 'react';
import { QueryOptions } from 'useQuery';

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

export const NODE_ENV = process.env.NODE_ENV;

export const IS_NOT_PRODUCTION = NODE_ENV !== 'production';

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
   *
   * For hooks pool usage you need to specify it's types
   * using **declare global interface gqlessHooksPool**
   * anywhere in your application
   * @example
   * declare global {
   *   interface gqlessHooksPool {
   *     query1: {
   *       data: string[];
   *       variables: {
   *         variable1: number;
   *       }
   *     query2: {
   *       data: string;
   *     };
   *   }
   */
  hookId?: keyof gqlessHooksPool;
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

export const logDevErrors = IS_NOT_PRODUCTION
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
  notifyOnNetworkStatusChangeRef: { current: boolean };
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
      notifyOnNetworkStatusChangeRef: { current: shouldNotifyLoading },
    } = argsRef.current;

    effects.onPreEffect?.();

    if (shouldNotifyLoading && stateRef.current.fetchState !== 'loading') {
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
      let errorPayload: GraphQLError[];

      const errorText = `Network error, received status code ${response.status} ${response.statusText}`;

      if (Array.isArray(json?.errors)) {
        errorPayload = json.errors;
      } else if (Array.isArray(json)) {
        errorPayload = json;
      } else {
        errorPayload = [new GraphQLError(errorText)];
      }

      effects.onErrorEffect?.(errorPayload);

      onError?.(errorPayload);

      dispatch({
        type: 'error',
        payload: errorPayload,
        stateRef,
      });

      throw Error(errorText);
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

declare global {
  interface gqlessHooksPool {}
}

type gqlessHookVariableTemplate = { variables: IVariables };
type gqlessHookDataTemplate = { data: unknown };

/**
 * Hooks pool of **gqless-hooks**.
 *
 * Hooks are added based on **hookId**
 */
export type HooksPool = {
  [K in keyof gqlessHooksPool]?: Hook<
    gqlessHooksPool[K] extends gqlessHookDataTemplate
      ? gqlessHooksPool[K]['data']
      : unknown,
    gqlessHooksPool[K] extends gqlessHookVariableTemplate
      ? gqlessHooksPool[K]['variables']
      : IVariables
  >;
};

/**
 * Hook data inside the Hooks Pool
 */
export interface Hook<TData, TVariables extends IVariables> {
  /**
   * Generic hook callback of the hook
   */
  callback: (args?: {
    variables?: TVariables;
    fetchPolicy?: FetchPolicy;
  }) => Promise<Maybe<TData>>;
  /**
   * Hook callback using **cache-and-network** fetchPolicy.
   */
  refetch: (args?: { variables?: TVariables }) => Promise<Maybe<TData>>;
  /**
   * Current hook state.
   */
  state: Readonly<{ current: Readonly<IState<TData>> }>;
  /**
   * Set hook data
   *
   * It can be the new data itself, or a function that receives
   * the previous data and returns the new data
   */
  setData: (
    data: Maybe<TData> | ((previousData: Maybe<TData>) => Maybe<TData>)
  ) => void;
}

function usePreviousDistinct<T>(value: T): T | undefined {
  const prevRef = useRef<T>();
  const curRef = useRef<T>(value);
  const isFirstMount = useRef(true);

  if (!isFirstMount && curRef.current !== value) {
    prevRef.current = curRef.current;
    curRef.current = value;
  }

  if (isFirstMount.current) {
    isFirstMount.current = false;
  }

  return prevRef.current;
}

export const useSubscribeCache = (args: {
  sharedCacheId: string | undefined;
  dispatch: Dispatch<IDispatch<any>>;
  stateRef: {
    current: IState<any>;
  };
  optionsRef: { current: QueryOptions<any, any> };
}) => {
  const argsRef = useRef(args);
  const { sharedCacheId, stateRef, optionsRef } = (argsRef.current = args);
  const previousCacheKey = usePreviousDistinct(sharedCacheId);

  const firstMount = useRef(true);

  const cacheSubscribeFnRef = useRef<CacheSubFn>();

  const foundCache = useRef(false);

  useEffect(() => {
    if (sharedCacheId) {
      const { stateRef, dispatch } = argsRef.current;
      cacheSubscribeFnRef.current = (data) => {
        if (stateRef.current.fetchState === 'done') {
          if (
            stringifyIfNeeded(data) !== stringifyIfNeeded(stateRef.current.data)
          ) {
            dispatch({
              type: 'done',
              payload: data,
              stateRef,
            });
          }
        }
      };

      return SharedCache.subscribeCache(
        sharedCacheId,
        cacheSubscribeFnRef.current
      );
    }

    return;
  }, [sharedCacheId]);

  if (sharedCacheId && previousCacheKey !== sharedCacheId) {
    if (firstMount.current) {
      firstMount.current = false;

      if (!optionsRef.current.lazy) {
        switch (optionsRef.current.fetchPolicy) {
          case 'cache-and-network':
          case 'cache-first':
          case 'cache-only': {
            const cacheData = SharedCache.cacheData[sharedCacheId];
            if (cacheData) {
              stateRef.current.called = true;
              stateRef.current.data = cacheData;
              stateRef.current.errors = undefined;
              if (optionsRef.current.fetchPolicy !== 'cache-and-network') {
                foundCache.current = true;
                stateRef.current.fetchState = 'done';
              }
            }
            break;
          }
        }
      }
    }
  }

  return {
    foundCache: foundCache.current,
    cacheSubscribeFn: cacheSubscribeFnRef,
  };
};

type CacheSubFn = (data: any) => void;

export const SharedCache = {
  cacheData: {} as Record<string, any>,

  cacheSubscribers: {} as Record<string, Set<CacheSubFn>>,

  subscribeCache: (cacheKey: string, fn: CacheSubFn) => {
    let cacheKeySubscribers = SharedCache.cacheSubscribers[cacheKey];
    if (cacheKeySubscribers) {
      const cacheData = SharedCache.cacheData[cacheKey];
      if (cacheData) {
        fn(cacheData);
      }
    } else {
      cacheKeySubscribers = new Set();
      SharedCache.cacheSubscribers[cacheKey] = cacheKeySubscribers;
    }

    cacheKeySubscribers.add(fn);

    return () => {
      cacheKeySubscribers.delete(fn);
      if (cacheKeySubscribers.size === 0) {
        delete SharedCache.cacheSubscribers[cacheKey];
      }
    };
  },

  setCacheData: (
    cacheKey: string,
    data: any,
    setter: { current?: CacheSubFn } | null
  ) => {
    SharedCache.cacheData[cacheKey] = data;
    const cacheSubscribers = SharedCache.cacheSubscribers[cacheKey];
    const cacherSubFn = setter?.current;

    if (cacheSubscribers) {
      for (const subscribeFn of cacheSubscribers) {
        if (subscribeFn !== cacherSubFn) {
          subscribeFn(data);
        }
      }
    }
  },

  hooksPool: {} as HooksPool,

  subscribeHookPool: (
    hookId: string | number | undefined,
    hook: Hook<any, any>
  ) => {
    if (hookId != null) {
      if (IS_NOT_PRODUCTION) {
        if (hookId in SharedCache.hooksPool) {
          console.warn(
            `Duplicated hook id "${hookId}", previous hook overwriten!`
          );
        }
      }
      (SharedCache.hooksPool as any)[hookId] = hook;
      return () => {
        delete (SharedCache.hooksPool as any)[hookId];
      };
    }
    return;
  },
};
