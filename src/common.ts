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
   * Event called on every successful hook call.
   * Including **cache updates**, **setData** calls, and **successful network calls**.
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
   * **onCompleted** event and **fetchMore**.
   *
   * For hooks pool usage you need to specify it's types
   * using **declare global interface gqlessHooksPool**
   * anywhere in your application
   * @example
   * declare global {
   *    interface gqlessHooksPool {
   *     query1: {
   *       data: string[];
   *       variables: {
   *         variable1: number;
   *       };
   *     };
   *     query2: {
   *       data: string;
   *     };
   *   }
   * }
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
  if (!action.stateRef.current.called) {
    action.stateRef.current.called = true;
  }

  switch (action.type) {
    case 'done': {
      if (reducerState.fetchState === 'error') {
        if (
          stringifyIfNeeded(action.payload) !==
          stringifyIfNeeded(reducerState.data)
        ) {
          action.stateRef.current.data = action.payload;

          const newState = { ...reducerState };
          newState.data = action.payload;

          return newState;
        }
        return reducerState;
      }

      action.stateRef.current.data = action.payload;

      return {
        fetchState: 'done',
        data: action.payload,
        called: true,
      };
    }
    case 'loading': {
      action.stateRef.current.fetchState = 'loading';

      return {
        fetchState: 'loading',
        data: reducerState.data,
        called: true,
      };
    }
    case 'error': {
      action.stateRef.current.fetchState = 'error';
      action.stateRef.current.errors = action.payload;

      return {
        fetchState: 'error',
        data: reducerState.data,
        called: true,
        errors: action.payload,
      };
    }
    case 'setData': {
      action.stateRef.current.data = action.payload;

      const newState = { ...reducerState };
      newState.data = action.payload;

      return newState;
    }
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
      type,
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
        Accept: 'application/json',
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

      if (Array.isArray(json?.errors)) {
        errorPayload = json.errors;
      } else if (Array.isArray(json)) {
        errorPayload = json;
      } else {
        errorPayload = [
          new GraphQLError(
            `Network error, received status code ${response.status} ${response.statusText}`
          ),
        ];
      }

      effects.onErrorEffect?.(errorPayload);

      onError?.(errorPayload);

      dispatch({
        type: 'error',
        payload: errorPayload,
        stateRef,
      });

      if (json) return json;

      throw errorPayload;
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
 * Contains globally accessible and mergeable **gqless-hooks** interfaces.
 */
declare global {
  /**
   * **gqless-hooks** Hooks Pool
   *
   * It enables `hookId` hook option and
   * the hooks are available at **onCompleted**
   * and `fetchMore`.
   *
   * `Please follow this example type signature.`
   * @example
   * declare global {
   *    interface gqlessHooksPool {
   *     query1: {
   *       data: string[];
   *       variables: {
   *         variable1: number;
   *       };
   *     };
   *     query2: {
   *       data: string;
   *     };
   *   }
   * }
   */
  interface gqlessHooksPool {}

  /**
   * **gqless-hooks** Shared Cache
   *
   * The hooks subscribe to this cache through `sharedCacheId` option
   * and you can imperatively modify it using the function `setCacheData`
   * exported from `"gqless-hooks"`.
   *
   * @example
   * import { setCacheData } from "gqless-hooks";
   *
   * declare global {
   *   interface gqlessSharedCache {
   *     cacheKey: string[];
   *   }
   * }
   *
   * // ...
   *
   * setCacheData("cacheKey", ["hello", "world"]);
   */
  interface gqlessSharedCache extends Record<string, any> {}
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

export const lazyInitialState = (): IState<any> => {
  return {
    fetchState: 'waiting',
    data: undefined,
    called: false,
  };
};

export const useSubscribeCache = (args: {
  sharedCacheId: keyof gqlessSharedCache | undefined;
  dispatch: Dispatch<IDispatch<any>>;
  stateRef: {
    current: IState<any>;
  };
  optionsRef: { current: QueryOptions<any, any, keyof gqlessSharedCache> };
}) => {
  const argsRef = useRef(args);
  const { sharedCacheId, stateRef, optionsRef } = (argsRef.current = args);

  const firstMount = useRef(true);

  const cacheSubscribeFnRef = useRef<CacheSubFn>();

  const foundCache = useRef(false);

  useEffect(() => {
    if (sharedCacheId != null) {
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

  if (sharedCacheId != null) {
    if (firstMount.current && !optionsRef.current.skip) {
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
  cacheData: {} as gqlessSharedCache,

  cacheSubscribers: {} as Record<string, Set<CacheSubFn>>,

  subscribeCache: (cacheKey: keyof gqlessSharedCache, fn: CacheSubFn) => {
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
    cacheKey: keyof gqlessSharedCache,
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

  subscribeHookPool: (hookId: string | number, hook: Hook<any, any>) => {
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
  },
};

/**
 * Set imperatively the data of a key in the **Shared cache**.
 *
 * `You can give the data right away or a function that receives
 * the previous cacheData and returns the new data`
 *
 * It can be useful for preparing an specific hook data and
 * prevent unnecessary fetches
 *
 * To improve it's type-safety you can declare anywhere
 * it's types following the example
 *
 * @example
 * declare global {
 *   interface gqlessSharedCache {
 *     anyCacheKey: string[]
 *   }
 * }
 */
export const setCacheData = <Key extends keyof gqlessSharedCache>(
  cacheKey: Key,
  data:
    | Maybe<gqlessSharedCache[Key]>
    | ((
        prevData: Maybe<gqlessSharedCache[Key]>
      ) => Maybe<gqlessSharedCache[Key]>)
) => {
  if (typeof data === 'function') {
    SharedCache.setCacheData(
      cacheKey,
      data(SharedCache.cacheData[cacheKey]),
      null
    );
  } else {
    SharedCache.setCacheData(cacheKey, data, null);
  }
};

/**
 * Shorthand utility function to return data from accessors
 *
 * @example
 * ```ts
 * useQuery((schema, variables) => {
 *    // This is the long way
 *    // const { title, content, publishedData } =
 *    // schema.blog({ id: variables.id });
 *    // return { title, content, publishedData };
 *
 *    // This is the quicker way
 *    return getAccessorFields(schema.blog({ id: variables.id }), "title", "content", "publishedDate");
 * })
 * ```
 */
export const getAccessorFields = <
  TAccesorData,
  TAccesorKeys extends keyof TAccesorData
>(
  accessor: TAccesorData,
  ...keys: TAccesorKeys[]
) => {
  let data: { [k in TAccesorKeys]: TAccesorData[k] } = {} as {
    [k in TAccesorKeys]: TAccesorData[k];
  };

  for (const key of keys) {
    data[key] = accessor[key];
  }

  return data;
};

/**
 * Shorthand utility function to return data from an accessor array
 *
 * @example
 * ```ts
 * useQuery((schema) => {
 *    // This is the long way
 *    // return schema.blogList.map({ title, content, publishedData }
 *    // => ({ title, content, publishedData }));
 *
 *    // This is the quicker way
 *    return getArrayAccessorFields(schema.blogList, "title", "content","publishedData");
 * })
 * ```
 */
export const getArrayAccessorFields = <
  TArrayValue,
  TArray extends TArrayValue[],
  TArrayValueKeys extends keyof TArrayValue
>(
  accessorArray: TArray,
  ...keys: TArrayValueKeys[]
) => {
  return accessorArray.map((data) => {
    return getAccessorFields(data, ...keys);
  });
};
